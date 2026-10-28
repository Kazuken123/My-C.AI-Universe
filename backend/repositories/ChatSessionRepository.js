import { randomUUID } from 'node:crypto';
import { snapshot, activeMemories } from '../services/turn-state.js';
import { BaseRepository } from './BaseRepository.js';
import { ChatSession, ChatMessage } from '../models/ChatSession.js';

/**
 * ChatSessionRepository Class
 * Manages relational SQL persistence across `chat_sessions`, `chat_messages`, and `message_variants`.
 */
export class ChatSessionRepository extends BaseRepository {
  constructor() {
    super('chat_sessions');
  }


  async claimRevision(db, session) {
    if (session.revision === null) {
      if (await db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(session.id)) {
        const error = new Error('Session changed; reload before trying again.'); error.statusCode = 409; throw error;
      }
      return;
    }
    const result = await db.prepare('UPDATE chat_sessions SET revision = revision + 1 WHERE id = ? AND revision = ?').run(session.id, session.revision);
    if (result.changes !== 1) {
      const error = new Error('Session changed or was deleted; reload before trying again.'); error.statusCode = 409; throw error;
    }
  }

  async writeState(db, session) {
    await db.prepare('UPDATE chat_sessions SET narrative_state = ?, affinity = ?, trust = ?, strain = ?, relationship_stage = ?, relationship_mood = ? WHERE id = ?')
      .run(JSON.stringify(session.narrativeState || {}),session.affinity,session.trust,session.strain,session.relationshipStage,session.relationshipMood,session.id);
    if (session.invalidateEventsFrom !== undefined) {
      await db.prepare('DELETE FROM chat_state_events WHERE session_id = ? AND position >= ?').run(session.id,session.invalidateEventsFrom);
      await db.prepare("DELETE FROM character_memories WHERE session_id = ? AND source IN ('conversation','story_summary')").run(session.id);
      await db.prepare('DELETE FROM chat_summary_checkpoints WHERE session_id = ?').run(session.id);
    }
    if (session.invalidateSummary) {
      await db.prepare("DELETE FROM character_memories WHERE session_id = ? AND source = 'story_summary'").run(session.id);
      await db.prepare('DELETE FROM chat_summary_checkpoints WHERE session_id = ?').run(session.id);
    }
    if (session.pendingEvent) {
      const event=session.pendingEvent;
      await db.prepare('INSERT INTO chat_state_events (id,session_id,message_id,position,kind,before_state,after_state,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(randomUUID(),session.id,event.messageId,event.position,event.kind,JSON.stringify(event.before),JSON.stringify(snapshot(session)),new Date().toISOString());
    }
  }

  committed(session) {
    session.revision = session.revision === null ? 0 : session.revision + 1;
    delete session.pendingEvent;
    delete session.invalidateSummary;
    delete session.invalidateEventsFrom;
  }

  async restoreStateAt(session, position) {
    const forgotten = session.narrativeState?.forgottenMemoryKeys || [];
    const event = await this.db.prepare('SELECT after_state FROM chat_state_events WHERE session_id = ? AND position <= ? ORDER BY position DESC, rowid DESC LIMIT 1').get(session.id,position);
    if (event) Object.assign(session,JSON.parse(event.after_state));
    else {
      const first = await this.db.prepare('SELECT before_state FROM chat_state_events WHERE session_id = ? ORDER BY position, rowid LIMIT 1').get(session.id);
      if (first) Object.assign(session,JSON.parse(first.before_state));
      else session.narrativeState = { lastChange: 'Earlier relationship snapshots are unavailable for this legacy chat.' };
    }
    session.narrativeState.forgottenMemoryKeys = [...new Set([...(session.narrativeState.forgottenMemoryKeys || []),...forgotten])];
    session.narrativeState.memories = activeMemories(session.narrativeState);
    session.invalidateEventsFrom = position + 1;
  }

  /**
   * Hydrate messages and variants for a given session row.
   * Uses a single batch query for all variants instead of N+1 per-message queries.
   */
  async _hydrateSession(sessionRow, targetDb = null) {
    if (!sessionRow) return null;
    const conn = targetDb || this.db;
    const msgRows = await conn
      .prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY position ASC, created_at ASC')
      .all(sessionRow.id);

    if (msgRows.length === 0) {
      return ChatSession.fromDatabaseRow(sessionRow, []);
    }

    // Batch-load ALL variants for every message in this session in 1 query
    const msgIds = msgRows.map(m => m.id);
    const placeholders = msgIds.map(() => '?').join(',');
    const allVariants = await conn
      .prepare(`SELECT * FROM message_variants WHERE message_id IN (${placeholders}) ORDER BY variant_index ASC`)
      .all(...msgIds);

    // Group variants by message_id
    const variantsByMsg = new Map();
    for (const v of allVariants) {
      const arr = variantsByMsg.get(v.message_id);
      if (arr) arr.push(v);
      else variantsByMsg.set(v.message_id, [v]);
    }

    const messages = msgRows.map(mRow =>
      ChatMessage.fromDatabaseRow(mRow, variantsByMsg.get(mRow.id) || [])
    );

    return ChatSession.fromDatabaseRow(sessionRow, messages);
  }

  /**
   * Find all chat sessions (optionally filtered by characterId and userId)
   * @param {string|null} characterId
   * @param {string|null} userId
   * @param {Object} [targetDb]
   * @returns {Promise<ChatSession[]>}
   */
  async findAll(characterId = null, userId = null, targetDb = null) {
    const conn = targetDb || this.db;
    let query = 'SELECT * FROM chat_sessions WHERE 1=1';
    const params = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    } else {
      query += ' AND user_id IS NULL';
    }

    if (characterId) {
      query += ' AND character_id = ?';
      params.push(characterId);
    }

    query += ' ORDER BY updated_at DESC';
    const rows = await conn.prepare(query).all(...params);

    const hydratedSessions = [];
    for (const row of rows) {
      const s = await this._hydrateSession(row, conn);
      if (s) hydratedSessions.push(s);
    }

    return hydratedSessions;
  }

  /**
   * Lightweight session listing: returns metadata (id, title, counts, last message)
   * without hydrating all messages and variants. Uses 1 SQL query total.
   * @param {string|null} characterId
   * @param {string|null} userId
   * @returns {Promise<Object[]>}
   */
  async findAllLean(characterId = null, userId = null) {
    let query = `
      SELECT
        s.id, s.user_id, s.character_id, s.persona_id,
        s.title, s.provider, s.affinity, s.trust, s.strain,
        s.relationship_stage, s.relationship_mood,
        s.created_at, s.updated_at,
        COUNT(m.id) AS message_count,
        (
          SELECT cm.content FROM chat_messages cm
          WHERE cm.session_id = s.id
          ORDER BY cm.position DESC, cm.created_at DESC
          LIMIT 1
        ) AS last_message
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) {
      query += ' AND s.user_id = ?';
      params.push(userId);
    } else {
      query += ' AND s.user_id IS NULL';
    }

    if (characterId) {
      query += ' AND s.character_id = ?';
      params.push(characterId);
    }

    query += ' GROUP BY s.id ORDER BY s.updated_at DESC';
    return await this.db.prepare(query).all(...params);
  }

  /**
   * Find a single chat session by ID
   * @param {string} sessionId
   * @param {string|null} userId
   * @param {Object} [targetDb]
   * @returns {Promise<ChatSession|null>}
   */
  async findById(sessionId, userId = null, targetDb = null) {
    if (!sessionId || !userId) return null;
    const conn = targetDb || this.db;
    const row = await conn.prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
    return await this._hydrateSession(row, conn);
  }

  /**
   * Find a single chat session by ID without user ownership scoping (Admin privileged only)
   * @param {string} sessionId
   * @param {Object} [targetDb]
   * @returns {Promise<ChatSession|null>}
   */
  async findByIdAdmin(sessionId, targetDb = null) {
    if (!sessionId) return null;
    const conn = targetDb || this.db;
    const row = await conn.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(sessionId);
    return await this._hydrateSession(row, conn);
  }

  /**
   * Save a single ChatSession and its composed ChatMessages and MessageVariants in an ACID transaction
   * @param {ChatSession|Object} sessionObj
   * @param {Object} [targetDb]
   * @returns {Promise<ChatSession>}
   */
  async save(sessionObj, targetDb = null) {
    const session = sessionObj instanceof ChatSession ? sessionObj : new ChatSession(sessionObj);

    const persistInConn = async (db) => {
      await this.claimRevision(db, session);
      await db.prepare(`
        INSERT INTO chat_sessions (
          id, user_id, character_id, persona_id, title, provider,
          affinity, trust, strain, relationship_stage, relationship_mood,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, chat_sessions.user_id),
          persona_id = excluded.persona_id,
          title = excluded.title,
          provider = excluded.provider,
          affinity = excluded.affinity,
          trust = excluded.trust,
          strain = excluded.strain,
          relationship_stage = excluded.relationship_stage,
          relationship_mood = excluded.relationship_mood,
          updated_at = excluded.updated_at
      `).run(
        session.id,
        session.userId || null,
        session.characterId,
        session.personaId || null,
        session.title,
        session.provider,
        Number(session.affinity ?? 0),
        Number(session.trust ?? session.affinity ?? 0),
        Number(session.strain ?? 0),
        String(session.relationshipStage || 'Stranger / Neutral'),
        String(session.relationshipMood || 'Calm'),
        session.createdAt,
        session.updatedAt
      );

      // Only remove messages that are no longer part of this session (e.g. on rewind)
      const currentMsgIds = session.messages.map(m => m.id);
      if (currentMsgIds.length > 0) {
        const placeholders = currentMsgIds.map(() => '?').join(',');
        await db.prepare(`DELETE FROM chat_messages WHERE session_id = ? AND id NOT IN (${placeholders})`).run(session.id, ...currentMsgIds);
      } else {
        await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(session.id);
      }

      const upsertMsgStmt = db.prepare(`
        INSERT INTO chat_messages (
          id, session_id, role, content, selected_variant_index, is_pinned, rating, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          content = excluded.content,
          selected_variant_index = excluded.selected_variant_index,
          is_pinned = excluded.is_pinned,
          rating = excluded.rating,
          position = excluded.position
      `);
      const upsertVarStmt = db.prepare(`
        INSERT INTO message_variants (id, message_id, variant_index, text, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          variant_index = excluded.variant_index,
          text = excluded.text
      `);

      for (let posIdx = 0; posIdx < session.messages.length; posIdx++) {
        const msg = session.messages[posIdx];
        await upsertMsgStmt.run(
          msg.id,
          session.id,
          msg.role,
          msg.content,
          msg.selectedVariantIndex,
          msg.isPinned ? 1 : 0,
          msg.rating,
          posIdx,
          msg.createdAt
        );

        if (Array.isArray(msg.variants)) {
          for (let varIdx = 0; varIdx < msg.variants.length; varIdx++) {
            const v = msg.variants[varIdx];
            await upsertVarStmt.run(
              v.id || `${msg.id}_v${varIdx + 1}`,
              msg.id,
              varIdx,
              v.text,
              v.createdAt
            );
          }
        }
      }
      await this.writeState(db, session);
    };

    if (targetDb) {
      await persistInConn(targetDb);
    } else {
      await this.runInTransaction(async (txDb) => {
        await persistInConn(txDb);
      });
    }

    this.committed(session);
    return session;
  }

  /**
   * O(1) Fast append for newly created messages in an existing or new session
   * Avoids re-iterating and re-upserting the entire message history on every chat turn.
   * @param {ChatSession} session
   * @param {ChatMessage[]} newMessages
   */
  async appendMessages(session, newMessages = []) {
    if (!newMessages || newMessages.length === 0) {
      return await this.save(session);
    }

    await this.runInTransaction(async (db) => {
      await this.claimRevision(db, session);
      await db.prepare(`
        INSERT INTO chat_sessions (
          id, user_id, character_id, persona_id, title, provider,
          affinity, trust, strain, relationship_stage, relationship_mood,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, chat_sessions.user_id),
          persona_id = excluded.persona_id,
          title = excluded.title,
          provider = excluded.provider,
          affinity = excluded.affinity,
          trust = excluded.trust,
          strain = excluded.strain,
          relationship_stage = excluded.relationship_stage,
          relationship_mood = excluded.relationship_mood,
          updated_at = excluded.updated_at
      `).run(
        session.id,
        session.userId || null,
        session.characterId,
        session.personaId || null,
        session.title,
        session.provider,
        Number(session.affinity ?? 0),
        Number(session.trust ?? session.affinity ?? 0),
        Number(session.strain ?? 0),
        String(session.relationshipStage || 'Stranger / Neutral'),
        String(session.relationshipMood || 'Calm'),
        session.createdAt,
        session.updatedAt
      );

      const upsertMsgStmt = db.prepare(`
        INSERT INTO chat_messages (
          id, session_id, role, content, selected_variant_index, is_pinned, rating, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          role = excluded.role,
          content = excluded.content,
          selected_variant_index = excluded.selected_variant_index,
          is_pinned = excluded.is_pinned,
          rating = excluded.rating,
          position = excluded.position
      `);

      const upsertVarStmt = db.prepare(`
        INSERT INTO message_variants (id, message_id, variant_index, text, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          variant_index = excluded.variant_index,
          text = excluded.text
      `);

      for (const msg of newMessages) {
        const posIdx = session.messages.indexOf(msg);
        const finalPos = posIdx !== -1 ? posIdx : Math.max(0, session.messages.length - 1);

        await upsertMsgStmt.run(
          msg.id,
          session.id,
          msg.role,
          msg.content,
          msg.selectedVariantIndex,
          msg.isPinned ? 1 : 0,
          msg.rating,
          finalPos,
          msg.createdAt
        );

        if (Array.isArray(msg.variants)) {
          for (let varIdx = 0; varIdx < msg.variants.length; varIdx++) {
            const v = msg.variants[varIdx];
            await upsertVarStmt.run(
              v.id || `${msg.id}_v${varIdx + 1}`,
              msg.id,
              varIdx,
              v.text,
              v.createdAt
            );
          }
        }
      }
      await this.writeState(db, session);
    });

    this.committed(session);
    return session;
  }

  /**
   * O(1) Fast insert for a newly regenerated swipe variant on an existing message
   * @param {ChatSession} session
   * @param {ChatMessage} message
   * @param {MessageVariant} newVariant
   */
  async appendVariant(session, message, newVariant) {
    await this.runInTransaction(async (db) => {
      await this.claimRevision(db, session);
      await db.prepare(`
        INSERT INTO message_variants (id, message_id, variant_index, text, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          variant_index = excluded.variant_index,
          text = excluded.text
      `).run(
        newVariant.id || `${message.id}_v${message.variants.length}`,
        message.id,
        newVariant.variantIndex ?? (message.variants.length - 1),
        newVariant.text,
        newVariant.createdAt
      );

      await db.prepare(`
        UPDATE chat_messages
        SET content = ?, selected_variant_index = ?
        WHERE id = ? AND session_id = ?
      `).run(message.content, message.selectedVariantIndex, message.id, session.id);

      await db.prepare(`
        UPDATE chat_sessions SET updated_at = ? WHERE id = ?
      `).run(session.updatedAt, session.id);
      await this.writeState(db, session);
    });
    this.committed(session);
  }

  /**
   * Fast targeted update for a single message in a session without rewriting the entire session
   * @param {string} sessionId
   * @param {string} messageId
   * @param {Object} fields
   * @returns {Promise<boolean>}
   */
  async updateMessageFields(sessionId, messageId, fields = {}, session = null) {
    const sets = [];
    const params = [];

    if (typeof fields.selectedVariantIndex === 'number') {
      sets.push('selected_variant_index = ?');
      params.push(fields.selectedVariantIndex);
    }
    if (typeof fields.content === 'string') {
      sets.push('content = ?');
      params.push(fields.content);
    }
    if (typeof fields.isPinned === 'boolean') {
      sets.push('is_pinned = ?');
      params.push(fields.isPinned ? 1 : 0);
    }
    if (typeof fields.rating === 'number') {
      sets.push('rating = ?');
      params.push(fields.rating);
    }

    if (sets.length === 0) return false;

    params.push(messageId, sessionId);
    await this.runInTransaction(async db => {
      if (session) await this.claimRevision(db,session);
      else await db.prepare('UPDATE chat_sessions SET revision = revision + 1 WHERE id = ?').run(sessionId);
      await db.prepare(`UPDATE chat_messages SET ${sets.join(', ')} WHERE id = ? AND session_id = ?`).run(...params);
      if (typeof fields.content === 'string') {
        await db.prepare('UPDATE message_variants SET text = ? WHERE message_id = ? AND variant_index = (SELECT selected_variant_index FROM chat_messages WHERE id = ? AND session_id = ?)')
          .run(fields.content,messageId,messageId,sessionId);
      }
      await db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(),sessionId);
      if (session) await this.writeState(db,session);
    });
    if (session) this.committed(session);
    return true;
  }

  /**
   * O(1) Fast update for session relationship state and metrics
   * @param {string} sessionId
   * @param {Object} state
   */
  async updateRelationshipState(sessionId, state = {}, session = null) {
    if (!sessionId) return false;
    await this.runInTransaction(async db => {
    if (session) await this.claimRevision(db,session);
    else await db.prepare("UPDATE chat_sessions SET revision = revision + 1 WHERE id = ?").run(sessionId);
    await db.prepare(`
      UPDATE chat_sessions
      SET affinity = COALESCE(?, affinity),
          trust = COALESCE(?, trust),
          strain = COALESCE(?, strain),
          relationship_stage = COALESCE(?, relationship_stage),
          relationship_mood = COALESCE(?, relationship_mood),
          updated_at = ?
      WHERE id = ?
    `).run(
      typeof state.affinity === 'number' ? Number(state.affinity) : null,
      typeof state.trust === 'number' ? Number(state.trust) : (typeof state.affinity === 'number' ? Number(state.affinity) : null),
      typeof state.strain === 'number' ? Number(state.strain) : null,
      (typeof state.relationshipStage === 'string' && state.relationshipStage.trim()) ? state.relationshipStage.trim() : null,
      (typeof state.relationshipMood === 'string' && state.relationshipMood.trim()) ? state.relationshipMood.trim() : null,
      new Date().toISOString(),
      sessionId
    );
    if (session) await this.writeState(db,session);
    });
    if (session) this.committed(session);
    return true;
  }

  /**
   * Bulk synchronize chat sessions
   * @param {ChatSession[]} sessions
   */
  async saveAll(sessions) {
    return await this.runInTransaction(async (db) => {
      const keepIds = sessions.map(s => s.id);
      if (keepIds.length === 0) {
        await db.prepare('DELETE FROM chat_sessions').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      await db.prepare(`DELETE FROM chat_sessions WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const s of sessions) {
        await this.save(s, db);
      }
    });
  }

  /**
   * Count total chat messages across all sessions
   * @param {Object} [targetDb]
   * @returns {Promise<number>}
   */
  async countMessages(targetDb = null) {
    const conn = targetDb || this.db;
    try {
      const row = await conn.prepare('SELECT COUNT(*) AS count FROM chat_messages').get();
      return Number(row?.count) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Aggregate session count grouped by user_id
   * @param {Object} [targetDb]
   * @returns {Promise<Map<string, number>>}
   */
  async countByUser(targetDb = null) {
    const conn = targetDb || this.db;
    try {
      const rows = await conn.prepare(`
        SELECT user_id, COUNT(*) as count
        FROM chat_sessions
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      `).all();
      return new Map((rows || []).map(r => [r.user_id, Number(r.count) || 0]));
    } catch {
      return new Map();
    }
  }
}

export const chatSessionRepository = new ChatSessionRepository();

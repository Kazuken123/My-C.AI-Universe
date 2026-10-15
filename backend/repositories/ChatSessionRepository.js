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
        s.title, s.provider, s.created_at, s.updated_at,
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
      await db.prepare(`
        INSERT INTO chat_sessions (id, user_id, character_id, persona_id, title, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, chat_sessions.user_id),
          persona_id = excluded.persona_id,
          title = excluded.title,
          provider = excluded.provider,
          updated_at = excluded.updated_at
      `).run(
        session.id,
        session.userId || null,
        session.characterId,
        session.personaId || null,
        session.title,
        session.provider,
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
    };

    if (targetDb) {
      await persistInConn(targetDb);
    } else {
      await this.runInTransaction(async (txDb) => {
        await persistInConn(txDb);
      });
    }

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
      await db.prepare(`
        INSERT INTO chat_sessions (id, user_id, character_id, persona_id, title, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = COALESCE(excluded.user_id, chat_sessions.user_id),
          persona_id = excluded.persona_id,
          title = excluded.title,
          provider = excluded.provider,
          updated_at = excluded.updated_at
      `).run(
        session.id,
        session.userId || null,
        session.characterId,
        session.personaId || null,
        session.title,
        session.provider,
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
    });

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
    });
  }

  /**
   * Fast targeted update for a single message in a session without rewriting the entire session
   * @param {string} sessionId
   * @param {string} messageId
   * @param {Object} fields
   * @returns {Promise<boolean>}
   */
  async updateMessageFields(sessionId, messageId, fields = {}) {
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
    await this.db.prepare(`UPDATE chat_messages SET ${sets.join(', ')} WHERE id = ? AND session_id = ?`).run(...params);
    await this.db.prepare('UPDATE chat_sessions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), sessionId);
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
}

export const chatSessionRepository = new ChatSessionRepository();

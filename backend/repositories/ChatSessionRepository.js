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
   * Hydrate messages and variants for a given session row
   */
  _hydrateSession(sessionRow) {
    if (!sessionRow) return null;
    const msgRows = this.db
      .prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY position ASC, created_at ASC')
      .all(sessionRow.id);
    const varStmt = this.db.prepare('SELECT * FROM message_variants WHERE message_id = ? ORDER BY variant_index ASC');

    const messages = msgRows.map(mRow => {
      const vRows = varStmt.all(mRow.id);
      return ChatMessage.fromDatabaseRow(mRow, vRows);
    });

    return ChatSession.fromDatabaseRow(sessionRow, messages);
  }

  /**
   * Find all chat sessions (optionally filtered by characterId and userId)
   * @param {string|null} characterId
   * @param {string|null} userId
   * @returns {ChatSession[]}
   */
  findAll(characterId = null, userId = null) {
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
    const rows = this.db.prepare(query).all(...params);

    return rows.map(row => this._hydrateSession(row));
  }

  /**
   * Find a single chat session by ID
   * @param {string} sessionId
   * @param {string|null} userId
   * @returns {ChatSession|null}
   */
  findById(sessionId, userId = null) {
    if (!sessionId) return null;
    const query = userId
      ? 'SELECT * FROM chat_sessions WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
      : 'SELECT * FROM chat_sessions WHERE id = ?';
    const row = userId
      ? this.db.prepare(query).get(sessionId, userId)
      : this.db.prepare(query).get(sessionId);
    return this._hydrateSession(row);
  }

  /**
   * Save a single ChatSession and its composed ChatMessages and MessageVariants in an ACID transaction
   * @param {ChatSession|Object} sessionObj
   * @returns {ChatSession}
   */
  save(sessionObj) {
    const session = sessionObj instanceof ChatSession ? sessionObj : new ChatSession(sessionObj);

    this.runInTransaction((db) => {
      db.prepare(`
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

      db.prepare('DELETE FROM chat_messages WHERE session_id = ?').run(session.id);

      const insertMsgStmt = db.prepare(`
        INSERT INTO chat_messages (
          id, session_id, role, content, selected_variant_index, is_pinned, rating, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertVarStmt = db.prepare(`
        INSERT INTO message_variants (id, message_id, variant_index, text, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      session.messages.forEach((msg, posIdx) => {
        insertMsgStmt.run(
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

        msg.variants.forEach((v, varIdx) => {
          insertVarStmt.run(
            v.id || `${msg.id}_v${varIdx + 1}`,
            msg.id,
            varIdx,
            v.text,
            v.createdAt
          );
        });
      });
    });

    return session;
  }

  /**
   * Bulk synchronize chat sessions
   */
  saveAll(sessions) {
    this.runInTransaction((db) => {
      const keepIds = sessions.map(s => s.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM chat_sessions').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM chat_sessions WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const s of sessions) {
        this.save(s);
      }
    });
  }
}

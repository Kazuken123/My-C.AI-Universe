import { BaseRepository } from './BaseRepository.js';
import { CharacterMemory } from '../models/CharacterMemory.js';
import { ValidationError } from '../ai/errors.js';

/**
 * MemoryRepository Class
 * Manages relational SQL persistence for CharacterMemory entities.
 */
export class MemoryRepository extends BaseRepository {
  constructor() {
    super('character_memories');
  }

  async findAll(characterId = null, targetDb = null) {
    const conn = targetDb || this.db;
    const rows = characterId
      ? await conn
          .prepare('SELECT * FROM character_memories WHERE character_id = ? ORDER BY created_at ASC')
          .all(characterId)
      : await conn.prepare('SELECT * FROM character_memories ORDER BY created_at ASC').all();

    return rows.map(r => CharacterMemory.fromDatabaseRow(r));
  }

  /**
   * Public lore must be explicitly global. Private memories require a live matching session.
   */
  async findForContext(characterId, sessionId = null, targetDb = null) {
    if (!characterId) return [];
    const conn = targetDb || this.db;
    const rows = sessionId
      ? await conn.prepare(`
          SELECT * FROM character_memories
          WHERE character_id = ?
            AND ((visibility = 'global' AND session_id IS NULL) OR
              (visibility = 'session' AND session_id = ? AND EXISTS (
                SELECT 1 FROM chat_sessions s
                JOIN users u ON u.id = s.user_id JOIN characters c ON c.id = s.character_id
                WHERE s.id = character_memories.session_id AND s.character_id = character_memories.character_id
              )))
            AND source != 'story_summary'
          ORDER BY created_at ASC
        `).all(characterId, sessionId)
      : await conn.prepare(`
          SELECT * FROM character_memories
          WHERE character_id = ?
            AND session_id IS NULL
            AND visibility = 'global'
            AND source != 'story_summary'
          ORDER BY created_at ASC
        `).all(characterId);

    return rows.map(r => CharacterMemory.fromDatabaseRow(r));
  }

  /**
   * O(1) indexed lookup for a session's rolling story summary
   */
  async findStorySummary(sessionId, targetDb = null) {
    if (!sessionId) return null;
    const conn = targetDb || this.db;
    const row = await conn.prepare(`
      SELECT * FROM character_memories
      WHERE session_id = ? AND source = 'story_summary'
        AND visibility = 'session' AND EXISTS (
          SELECT 1 FROM chat_sessions s
          JOIN users u ON u.id = s.user_id JOIN characters c ON c.id = s.character_id
          WHERE s.id = character_memories.session_id AND s.character_id = character_memories.character_id
        )
      ORDER BY created_at DESC
      LIMIT 1
    `).get(sessionId);
    return CharacterMemory.fromDatabaseRow(row);
  }

  /**
   * Replace the rolling story summary for a session atomically without full-table scan
   */
  async upsertStorySummary(characterId, sessionId, content, targetDb = null) {
    if (!characterId || !sessionId || !content) return null;
    const conn = targetDb || this.db;
    await conn.prepare(`
      DELETE FROM character_memories
      WHERE session_id = ? AND source = 'story_summary'
    `).run(sessionId);

    const memory = new CharacterMemory({
      characterId,
      sessionId,
      content: content.trim(),
      source: 'story_summary'
    });
    return await this.save(memory, conn);
  }

  async findById(id, targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare('SELECT * FROM character_memories WHERE id = ?').get(id);
    return CharacterMemory.fromDatabaseRow(row);
  }

  async save(memoryObj, targetDb = null) {
    const conn = targetDb || this.db;
    const memory = memoryObj instanceof CharacterMemory ? memoryObj : new CharacterMemory(memoryObj);
    memory.validate();

    const result = await conn.prepare(`
      INSERT INTO character_memories (id, character_id, session_id, visibility, content, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        source = excluded.source
      WHERE character_memories.character_id = excluded.character_id
        AND character_memories.session_id IS excluded.session_id
        AND character_memories.visibility = excluded.visibility
    `).run(
      memory.id,
      memory.characterId,
      memory.sessionId,
      memory.visibility,
      memory.content,
      memory.source,
      memory.createdAt
    );

    if (!result.changes) throw new ValidationError('Memory scope does not match the existing record', 'visibility');

    return memory;
  }

  async saveAll(memories) {
    return await this.runInTransaction(async (db) => {
      const keepIds = memories.map(m => m.id);
      if (keepIds.length === 0) {
        await db.prepare('DELETE FROM character_memories').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      await db.prepare(`DELETE FROM character_memories WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const m of memories) {
        await this.save(m, db);
      }
    });
  }
}

export const memoryRepository = new MemoryRepository();

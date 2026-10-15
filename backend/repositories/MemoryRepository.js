import { BaseRepository } from './BaseRepository.js';
import { CharacterMemory } from '../models/CharacterMemory.js';

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
   * Retrieve memories scoped strictly to global character lore (session_id IS NULL)
   * and the active chat session (session_id = ?), excluding rolling story_summary rows.
   */
  async findForContext(characterId, sessionId = null, targetDb = null) {
    if (!characterId) return [];
    const conn = targetDb || this.db;
    const rows = sessionId
      ? await conn.prepare(`
          SELECT * FROM character_memories
          WHERE character_id = ?
            AND (session_id IS NULL OR session_id = ?)
            AND source != 'story_summary'
          ORDER BY created_at ASC
        `).all(characterId, sessionId)
      : await conn.prepare(`
          SELECT * FROM character_memories
          WHERE character_id = ?
            AND session_id IS NULL
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

    await conn.prepare(`
      INSERT INTO character_memories (id, character_id, session_id, content, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        source = excluded.source
    `).run(
      memory.id,
      memory.characterId,
      memory.sessionId,
      memory.content,
      memory.source,
      memory.createdAt
    );

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

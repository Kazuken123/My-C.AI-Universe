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

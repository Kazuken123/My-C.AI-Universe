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

  findAll(characterId = null) {
    const rows = characterId
      ? this.db
          .prepare('SELECT * FROM character_memories WHERE character_id = ? ORDER BY created_at ASC')
          .all(characterId)
      : this.db.prepare('SELECT * FROM character_memories ORDER BY created_at ASC').all();

    return rows.map(r => CharacterMemory.fromDatabaseRow(r));
  }

  findById(id) {
    const row = this.db.prepare('SELECT * FROM character_memories WHERE id = ?').get(id);
    return CharacterMemory.fromDatabaseRow(row);
  }

  save(memoryObj) {
    const memory = memoryObj instanceof CharacterMemory ? memoryObj : new CharacterMemory(memoryObj);
    memory.validate();

    this.db.prepare(`
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

  saveAll(memories) {
    this.runInTransaction((db) => {
      const keepIds = memories.map(m => m.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM character_memories').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM character_memories WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const m of memories) {
        this.save(m);
      }
    });
  }
}

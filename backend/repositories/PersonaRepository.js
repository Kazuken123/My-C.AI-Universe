import { BaseRepository } from './BaseRepository.js';
import { UserPersona } from '../models/UserPersona.js';

/**
 * PersonaRepository Class
 * Manages relational SQL persistence for UserPersona entities.
 */
export class PersonaRepository extends BaseRepository {
  constructor() {
    super('user_personas');
  }

  findAll() {
    const rows = this.db
      .prepare('SELECT * FROM user_personas ORDER BY is_default DESC, created_at ASC')
      .all();
    return rows.map(r => UserPersona.fromDatabaseRow(r));
  }

  findById(id) {
    const row = this.db.prepare('SELECT * FROM user_personas WHERE id = ?').get(id);
    return UserPersona.fromDatabaseRow(row);
  }

  findDefault() {
    const row = this.db
      .prepare('SELECT * FROM user_personas WHERE is_default = 1 LIMIT 1')
      .get();
    if (row) return UserPersona.fromDatabaseRow(row);
    const all = this.findAll();
    return all[0] || null;
  }

  save(personaObj) {
    const persona = personaObj instanceof UserPersona ? personaObj : new UserPersona(personaObj);
    persona.validate();

    this.runInTransaction((db) => {
      if (persona.isDefault) {
        db.prepare('UPDATE user_personas SET is_default = 0').run();
      }
      db.prepare(`
        INSERT INTO user_personas (id, name, avatar, description, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          avatar = excluded.avatar,
          description = excluded.description,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `).run(
        persona.id,
        persona.name,
        persona.avatar,
        persona.description,
        persona.isDefault ? 1 : 0,
        persona.createdAt,
        persona.updatedAt
      );
    });

    return persona;
  }

  saveAll(personas) {
    this.runInTransaction((db) => {
      const keepIds = personas.map(p => p.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM user_personas').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM user_personas WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const p of personas) {
        this.save(p);
      }
    });
  }
}

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

  findAll(userId = null) {
    const rows = userId
      ? this.db.prepare('SELECT * FROM user_personas WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').all(userId)
      : this.db.prepare('SELECT * FROM user_personas WHERE user_id IS NULL ORDER BY is_default DESC, created_at ASC').all();
    return rows.map(r => UserPersona.fromDatabaseRow(r));
  }

  findByUserId(userId) {
    return this.findAll(userId);
  }

  create(personaObj, userId = null) {
    return this.save(personaObj, userId);
  }

  findById(id, userId = null) {
    if (!id) return null;
    const row = userId
      ? this.db.prepare('SELECT * FROM user_personas WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(id, userId)
      : this.db.prepare('SELECT * FROM user_personas WHERE id = ?').get(id);
    return UserPersona.fromDatabaseRow(row);
  }

  findDefault(userId = null) {
    const row = userId
      ? this.db.prepare('SELECT * FROM user_personas WHERE user_id = ? AND is_default = 1 LIMIT 1').get(userId)
      : this.db.prepare('SELECT * FROM user_personas WHERE user_id IS NULL AND is_default = 1 LIMIT 1').get();
    if (row) return UserPersona.fromDatabaseRow(row);
    const all = this.findAll(userId);
    return all[0] || null;
  }

  save(personaObj, userId = null) {
    const persona = personaObj instanceof UserPersona ? personaObj : new UserPersona(personaObj);
    if (userId) persona.userId = userId;
    persona.validate();

    this.runInTransaction((db) => {
      if (persona.isDefault) {
        if (persona.userId) {
          db.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id = ?').run(persona.userId);
        } else {
          db.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id IS NULL').run();
        }
      }
      db.prepare(`
        INSERT INTO user_personas (id, user_id, name, avatar, description, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          name = excluded.name,
          avatar = excluded.avatar,
          description = excluded.description,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `).run(
        persona.id,
        persona.userId || null,
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

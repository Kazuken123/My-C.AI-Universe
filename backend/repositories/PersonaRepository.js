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

  async findAll(userId = null, targetDb = null) {
    const conn = targetDb || this.db;
    const rows = userId
      ? await conn.prepare('SELECT * FROM user_personas WHERE user_id = ? ORDER BY is_default DESC, created_at ASC').all(userId)
      : await conn.prepare('SELECT * FROM user_personas WHERE user_id IS NULL ORDER BY is_default DESC, created_at ASC').all();
    return rows.map(r => UserPersona.fromDatabaseRow(r));
  }

  async findByUserId(userId, targetDb = null) {
    return await this.findAll(userId, targetDb);
  }

  async create(personaObj, userId = null, targetDb = null) {
    return await this.save(personaObj, userId, targetDb);
  }

  async findById(id, userId = null, targetDb = null) {
    if (!id) return null;
    const conn = targetDb || this.db;
    const row = userId
      ? await conn.prepare('SELECT * FROM user_personas WHERE id = ? AND (user_id = ? OR user_id IS NULL)').get(id, userId)
      : await conn.prepare('SELECT * FROM user_personas WHERE id = ?').get(id);
    return UserPersona.fromDatabaseRow(row);
  }

  async findDefault(userId = null, targetDb = null) {
    const conn = targetDb || this.db;
    const row = userId
      ? await conn.prepare('SELECT * FROM user_personas WHERE user_id = ? AND is_default = 1 LIMIT 1').get(userId)
      : await conn.prepare('SELECT * FROM user_personas WHERE user_id IS NULL AND is_default = 1 LIMIT 1').get();
    if (row) return UserPersona.fromDatabaseRow(row);
    const all = await this.findAll(userId, targetDb);
    return all[0] || null;
  }

  async save(personaObj, userId = null, targetDb = null) {
    const persona = personaObj instanceof UserPersona ? personaObj : new UserPersona(personaObj);
    if (userId) persona.userId = userId;
    persona.validate();

    if (targetDb) {
      if (persona.isDefault) {
        if (persona.userId) {
          await targetDb.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id = ?').run(persona.userId);
        } else {
          await targetDb.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id IS NULL').run();
        }
      }
      await targetDb.prepare(`
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
    } else {
      await this.runInTransaction(async (db) => {
        if (persona.isDefault) {
          if (persona.userId) {
            await db.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id = ?').run(persona.userId);
          } else {
            await db.prepare('UPDATE user_personas SET is_default = 0 WHERE user_id IS NULL').run();
          }
        }
        await db.prepare(`
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
    }

    return persona;
  }

  async saveAll(personas) {
    return await this.runInTransaction(async (db) => {
      const keepIds = personas.map(p => p.id);
      if (keepIds.length === 0) {
        await db.prepare('DELETE FROM user_personas').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      await db.prepare(`DELETE FROM user_personas WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const p of personas) {
        await this.save(p, p.userId, db);
      }
    });
  }
}

export const personaRepository = new PersonaRepository();

import { getDatabase, runTransaction } from '../db/database.js';

/**
 * Abstract Base Repository Class (OOP Data Access Layer Root)
 * Encapsulates common SQL CRUD operations for relational tables.
 */
export class BaseRepository {
  /**
   * @param {string} tableName
   */
  constructor(tableName) {
    if (new.target === BaseRepository) {
      throw new TypeError('Cannot instantiate abstract class BaseRepository directly');
    }
    this.tableName = tableName;
  }

  get db() {
    return getDatabase();
  }

  async runInTransaction(callback) {
    return await runTransaction(callback);
  }

  async count(targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare(`SELECT COUNT(*) AS count FROM ${this.tableName}`).get();
    return Number(row?.count) || 0;
  }

  async deleteById(id, targetDb = null) {
    const conn = targetDb || this.db;
    const result = await conn.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}

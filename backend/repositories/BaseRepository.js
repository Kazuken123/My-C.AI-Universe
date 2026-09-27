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

  runInTransaction(callback) {
    return runTransaction(callback);
  }

  count() {
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM ${this.tableName}`).get();
    return Number(row?.count) || 0;
  }

  deleteById(id) {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }
}

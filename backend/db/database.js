import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { DB_DIR } from '../config/index.js';
import { compileCharacterSystemPrompt } from '../ai/prompt/characterPrompt.js';

const SQLITE_PATH = path.join(DB_DIR, 'universe.sqlite');
const SCHEMA_SQL_PATH = path.join(DB_DIR, 'schema.sql');
const SEED_SQL_PATH = path.join(DB_DIR, 'seed.sql');

/**
 * DatabaseConnection Singleton Class (OOP Database Manager)
 * Encapsulates SQLite connection lifecycle, DDL migration, seed execution, and ACID transactions.
 */
export class DatabaseConnection {
  static #instance = null;

  constructor() {
    if (DatabaseConnection.#instance) {
      return DatabaseConnection.#instance;
    }
    this.db = null;
    this.dbPath = SQLITE_PATH;
    DatabaseConnection.#instance = this;
  }

  /**
   * Get the singleton DatabaseConnection instance
   * @returns {DatabaseConnection}
   */
  static getInstance() {
    if (!DatabaseConnection.#instance) {
      DatabaseConnection.#instance = new DatabaseConnection();
    }
    return DatabaseConnection.#instance;
  }

  /**
   * Open and initialize the SQLite database connection
   * @returns {DatabaseSync}
   */
  connect() {
    if (this.db) return this.db;

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');

    this.#runMigrationsAndSeed();
    return this.db;
  }

  /**
   * Execute schema.sql and seed.sql if database is empty
   */
  #runMigrationsAndSeed() {
    const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
    this.db.exec(schemaSql);

    const countRow = this.db.prepare('SELECT COUNT(*) AS count FROM characters').get();
    if (!countRow || countRow.count === 0) {
      if (fs.existsSync(SEED_SQL_PATH)) {
        const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf8');
        this.db.exec(seedSql);

        const rows = this.db.prepare('SELECT * FROM characters').all();
        const updateStmt = this.db.prepare('UPDATE characters SET system_prompt = ? WHERE id = ?');
        for (const r of rows) {
          const compiled = compileCharacterSystemPrompt(r);
          updateStmt.run(compiled, r.id);
        }
        console.log(`[SQL DB] Initialized schema and seeded ${rows.length} characters into universe.sqlite`);
      }
    }
  }

  /**
   * Execute a function inside an atomic SQL transaction
   * @param {Function} callback
   */
  runTransaction(callback) {
    const conn = this.connect();
    conn.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = callback(conn);
      conn.exec('COMMIT;');
      return result;
    } catch (error) {
      conn.exec('ROLLBACK;');
      throw error;
    }
  }

  /**
   * Close the active SQLite connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export function getDatabase() {
  return DatabaseConnection.getInstance().connect();
}

export function runTransaction(fn) {
  return DatabaseConnection.getInstance().runTransaction(fn);
}

export function closeDatabase() {
  return DatabaseConnection.getInstance().close();
}

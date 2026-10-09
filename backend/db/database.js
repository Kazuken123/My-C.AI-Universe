import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { DB_DIR } from '../config/index.js';
import { compileCharacterSystemPrompt } from '../ai/prompt/characterPrompt.js';

const DEFAULT_SQLITE_PATH = path.join(DB_DIR, 'universe.sqlite');
const SCHEMA_SQL_PATH = path.join(DB_DIR, 'schema.sql');
const SEED_SQL_PATH = path.join(DB_DIR, 'seed.sql');

function resolveSqlitePath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  if (process.env.DATA_DIR) {
    if (!fs.existsSync(process.env.DATA_DIR)) {
      try { fs.mkdirSync(process.env.DATA_DIR, { recursive: true }); } catch {}
    }
    return path.join(process.env.DATA_DIR, 'universe.sqlite');
  }
  if (fs.existsSync('/var/data')) {
    return path.join('/var/data', 'universe.sqlite');
  }
  return DEFAULT_SQLITE_PATH;
}

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
    this.dbPath = resolveSqlitePath();
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

    const targetDir = path.dirname(this.dbPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (this.dbPath !== DEFAULT_SQLITE_PATH && !fs.existsSync(this.dbPath) && fs.existsSync(DEFAULT_SQLITE_PATH)) {
      try {
        fs.copyFileSync(DEFAULT_SQLITE_PATH, this.dbPath);
      } catch (copyErr) {
        console.warn('[SQL DB] Could not copy default database to persistent path:', copyErr.message);
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');

    this.#runMigrationsAndSeed();
    return this.db;
  }

  /**
   * Execute schema.sql and seed.sql if database is empty, and verify migrations
   */
  #runMigrationsAndSeed() {
    this.#ensureColumnExists('user_personas', 'user_id', 'TEXT');
    this.#ensureColumnExists('chat_sessions', 'user_id', 'TEXT');
    this.#ensureColumnExists('users', 'email', 'TEXT');
    this.#ensureColumnExists('users', 'auth_provider', "TEXT NOT NULL DEFAULT 'local'");
    this.#ensureColumnExists('users', 'provider_id', 'TEXT');

    // Purge any legacy unassigned chat sessions from before user auth was introduced
    try {
      this.db.exec('DELETE FROM chat_sessions WHERE user_id IS NULL;');
    } catch {
      // ignore
    }

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

    this.#ensurePrimaryUserAndPersona();
  }

  #ensurePrimaryUserAndPersona() {
    try {
      const user = this.db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1')
        .get('kazuken', 'giuaguy1234', 'giuaguy1234@gmail.com');

      const userId = user ? user.id : 'user_1791563262379_b6rd8';

      if (!user) {
        this.db.prepare(`
          INSERT INTO users (id, username, email, display_name, avatar, password_hash, auth_provider, provider_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          'kazuken',
          'giuaguy1234@gmail.com',
          'Tony',
          '👤',
          '36c618578acafae55d72c9464d0cd337:caf4d11f74f992e98f2592326f8ba436fff02b2cf1f8f5212eed3ba640ed783e8d37525784268b8b2b5a857e9263ae7a94d55b1e3431fccdb493366e807c8173',
          'google',
          'real_google_sub_999',
          '2026-10-09T16:27:42.379Z',
          '2026-10-09T16:29:25.213Z'
        );
      }

      const persona = this.db.prepare('SELECT * FROM user_personas WHERE user_id = ? LIMIT 1').get(userId);
      if (!persona) {
        this.db.prepare(`
          INSERT INTO user_personas (id, name, avatar, description, is_default, created_at, updated_at, user_id)
          VALUES (?, ?, ?, ?, 1, ?, ?, ?)
        `).run(
          'persona_1791563262405',
          'Tony',
          '🌟',
          'feeling tired and down most of the time\nself esteem is kinda low\nmy favorite drink is sweet tea or any type of sweet drink\nim good with all foods as long as it is edible',
          '2026-10-09T16:27:42.405Z',
          '2026-10-09T16:27:42.405Z',
          userId
        );
      }
    } catch (err) {
      console.warn('[SQL DB] Primary user initialization notice:', err.message);
    }
  }

  #ensureColumnExists(table, column, colType) {
    try {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all();
      const hasCol = cols.some(c => c.name === column);
      if (!hasCol) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${colType};`);
      }
    } catch {
      // ignore
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

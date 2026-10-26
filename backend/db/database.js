import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { DB_DIR } from '../config/index.js';
import { compileCharacterSystemPrompt } from '../ai/prompt/characterPrompt.js';
import { applyMemoryPrivacyMigration } from './migrations/20261027-memory-privacy.js';

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
 * Statement Wrapper for @libsql/client providing SQLite-compatible prepare/all/get/run APIs
 */
export class LibsqlStatementWrapper {
  constructor(executor, sql, dbConnection = null) {
    this.executor = executor;
    this.sql = sql;
    this.dbConnection = dbConnection;
  }

  #flattenArgs(args) {
    if (args.length === 1 && Array.isArray(args[0])) {
      return args[0];
    }
    return args;
  }

  async #executeWithRetry(payload, maxRetries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executor.execute(payload);
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || '');
        const isNetworkErr = msg.includes('fetch failed') || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
        if (isNetworkErr && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 120 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async all(...args) {
    if (this.dbConnection) await this.dbConnection.ensureReady();
    const flat = this.#flattenArgs(args);
    const res = await this.#executeWithRetry({ sql: this.sql, args: flat });
    return res.rows || [];
  }

  async get(...args) {
    if (this.dbConnection) await this.dbConnection.ensureReady();
    const flat = this.#flattenArgs(args);
    const res = await this.#executeWithRetry({ sql: this.sql, args: flat });
    return (res.rows && res.rows.length > 0) ? res.rows[0] : null;
  }

  async run(...args) {
    if (this.dbConnection) await this.dbConnection.ensureReady();
    const flat = this.#flattenArgs(args);
    const res = await this.#executeWithRetry({ sql: this.sql, args: flat });
    return {
      changes: res.rowsAffected || 0,
      lastInsertRowid: res.lastInsertRowid
    };
  }
}

/**
 * Connection Wrapper around @libsql/client or Transaction object
 */
export class LibsqlConnectionWrapper {
  constructor(client, dbConnection = null) {
    this.client = client;
    this.dbConnection = dbConnection;
  }

  prepare(sql) {
    return new LibsqlStatementWrapper(this.client, sql, this.dbConnection);
  }

  async exec(sql) {
    if (this.dbConnection) await this.dbConnection.ensureReady();
    return await this.client.executeMultiple(sql);
  }

  async execute(sqlOrObj) {
    if (this.dbConnection) await this.dbConnection.ensureReady();
    return await this.client.execute(sqlOrObj);
  }

  close() {
    if (this.client && typeof this.client.close === 'function') {
      this.client.close();
    }
  }
}

/**
 * DatabaseConnection Singleton Class (Turso / libSQL Unified Manager)
 * Automatically connects to Turso Cloud (via TURSO_DATABASE_URL) or falls back
 * transparently to local SQLite (backend/db/universe.sqlite).
 */
export class DatabaseConnection {
  static #instance = null;
  #rawClient = null;
  #wrappedDb = null;
  #initPromise = null;

  constructor() {
    if (DatabaseConnection.#instance) {
      return DatabaseConnection.#instance;
    }
    this.dbPath = resolveSqlitePath();
    this.isTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.trim());
    this.engineName = this.isTurso
      ? `Turso Cloud libSQL (${process.env.TURSO_DATABASE_URL.trim()})`
      : `SQLite (${this.dbPath})`;
    DatabaseConnection.#instance = this;
  }

  static getInstance() {
    if (!DatabaseConnection.#instance) {
      DatabaseConnection.#instance = new DatabaseConnection();
    }
    return DatabaseConnection.#instance;
  }

  connect() {
    if (this.#wrappedDb) return this.#wrappedDb;

    this.isTurso = Boolean(process.env.TURSO_DATABASE_URL && process.env.TURSO_DATABASE_URL.trim());

    if (this.isTurso) {
      const url = process.env.TURSO_DATABASE_URL.trim();
      const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
      this.#rawClient = createClient({
        url,
        authToken: authToken || undefined
      });
      this.engineName = `Turso Cloud libSQL (${url})`;
      console.log(`🌐 [DatabaseConnection] Connected to Turso Cloud: ${url}`);
    } else {
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

      const fileUrl = `file:${path.resolve(this.dbPath)}`;
      this.#rawClient = createClient({ url: fileUrl });
      this.engineName = `SQLite (${this.dbPath})`;
      console.log(`🗄️  [DatabaseConnection] Connected to local SQLite: ${this.dbPath}`);
    }

    this.#wrappedDb = new LibsqlConnectionWrapper(this.#rawClient, this);
    return this.#wrappedDb;
  }

  async ensureReady() {
    if (!this.#initPromise) {
      this.#initPromise = this.#runMigrationsAndSeed();
    }
    return this.#initPromise;
  }

  async #runMigrationsAndSeed() {
    const raw = this.#rawClient;
    if (!raw) return;

    try {
      try {
        await raw.execute('PRAGMA foreign_keys = ON;');
      } catch {
        // Ignored if cloud provider does not support pragma
      }

      if (fs.existsSync(SCHEMA_SQL_PATH)) {
        const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
        await raw.executeMultiple(schemaSql);
      }

      // Ensure 'role' column exists in users table (migration for existing databases)
      try {
        const usersColsRes = await raw.execute('PRAGMA table_info(users)');
        const hasRoleCol = (usersColsRes.rows || []).some(r => r.name === 'role');
        if (!hasRoleCol) {
          await raw.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
        }
      } catch (colErr) {
        console.warn('[SQL DB] Users role column migration notice:', colErr.message);
      }

      // Ensure 'owner_user_id' and relationship columns exist in characters table
      try {
        const charsColsRes = await raw.execute('PRAGMA table_info(characters)');
        const existingCharCols = new Set((charsColsRes.rows || []).map(r => r.name));
        if (!existingCharCols.has('owner_user_id')) {
          await raw.execute('ALTER TABLE characters ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
        }
        if (!existingCharCols.has('initial_affinity')) {
          await raw.execute('ALTER TABLE characters ADD COLUMN initial_affinity INTEGER NOT NULL DEFAULT 0');
        }
        if (!existingCharCols.has('initial_relationship_stage')) {
          await raw.execute("ALTER TABLE characters ADD COLUMN initial_relationship_stage TEXT NOT NULL DEFAULT 'Stranger / Neutral'");
        }
        if (!existingCharCols.has('relationship_dynamic')) {
          await raw.execute("ALTER TABLE characters ADD COLUMN relationship_dynamic TEXT NOT NULL DEFAULT ''");
        }
      } catch (charColErr) {
        console.warn('[SQL DB] Characters column migration notice:', charColErr.message);
      }

      // Ensure relationship columns exist in chat_sessions table
      try {
        const sessionsColsRes = await raw.execute('PRAGMA table_info(chat_sessions)');
        const existingSessionCols = new Set((sessionsColsRes.rows || []).map(r => r.name));
        if (!existingSessionCols.has('affinity')) {
          await raw.execute('ALTER TABLE chat_sessions ADD COLUMN affinity INTEGER NOT NULL DEFAULT 0');
        }
        if (!existingSessionCols.has('trust')) {
          await raw.execute('ALTER TABLE chat_sessions ADD COLUMN trust INTEGER NOT NULL DEFAULT 0');
        }
        if (!existingSessionCols.has('strain')) {
          await raw.execute('ALTER TABLE chat_sessions ADD COLUMN strain INTEGER NOT NULL DEFAULT 0');
        }
        if (!existingSessionCols.has('relationship_stage')) {
          await raw.execute("ALTER TABLE chat_sessions ADD COLUMN relationship_stage TEXT NOT NULL DEFAULT 'Stranger / Neutral'");
        }
        if (!existingSessionCols.has('relationship_mood')) {
          await raw.execute("ALTER TABLE chat_sessions ADD COLUMN relationship_mood TEXT NOT NULL DEFAULT 'Calm'");
        }
      } catch (sessColErr) {
        console.warn('[SQL DB] Chat sessions column migration notice:', sessColErr.message);
      }

    } catch (err) {
      console.warn('[SQL DB] Schema migration notice:', err.message);
    }

    // Privacy must be ready before seeding or serving data; never suppress its failure.
    await applyMemoryPrivacyMigration(raw);

    try {
      // Check if characters table is empty
      const countRes = await raw.execute('SELECT COUNT(*) AS count FROM characters');
      const count = Number(countRes.rows[0]?.count || 0);

      if (count === 0 && fs.existsSync(SEED_SQL_PATH)) {
        const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf8');
        await raw.executeMultiple(seedSql);

        const rowsRes = await raw.execute('SELECT * FROM characters');
        for (const r of rowsRes.rows) {
          const compiled = compileCharacterSystemPrompt(r);
          await raw.execute({
            sql: 'UPDATE characters SET system_prompt = ? WHERE id = ?',
            args: [compiled, r.id]
          });
        }
        console.log(`[SQL DB] Initialized schema and seeded ${rowsRes.rows.length} characters into database`);
      }
    } catch (err) {
      console.warn('[SQL DB] Migration/seed notice:', err.message);
    }
  }

  async runTransaction(callback) {
    this.connect();
    await this.ensureReady();
    const tx = await this.#rawClient.transaction();
    const txWrapper = new LibsqlConnectionWrapper(tx, null);
    try {
      const result = await callback(txWrapper);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  }

  close() {
    if (this.#wrappedDb) {
      this.#wrappedDb.close();
      this.#wrappedDb = null;
      this.#rawClient = null;
      this.#initPromise = null;
    }
  }
}

export function getDatabase() {
  return DatabaseConnection.getInstance().connect();
}

export async function runTransaction(fn) {
  return await DatabaseConnection.getInstance().runTransaction(fn);
}

export function closeDatabase() {
  return DatabaseConnection.getInstance().close();
}

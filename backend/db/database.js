import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { DB_DIR } from '../config/index.js';
import { compileCharacterSystemPrompt } from '../ai/prompt/characterPrompt.js';

const SQLITE_PATH = path.join(DB_DIR, 'universe.sqlite');
const SCHEMA_SQL_PATH = path.join(DB_DIR, 'schema.sql');
const SEED_SQL_PATH = path.join(DB_DIR, 'seed.sql');

let dbInstance = null;

/**
 * Initialize and return the singleton SQLite relational database connection
 * @returns {DatabaseSync}
 */
export function getDatabase() {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  dbInstance = new DatabaseSync(SQLITE_PATH);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Execute DDL schema
  const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
  dbInstance.exec(schemaSql);

  // Check if characters table is empty; if so, run seed.sql and compile full systemPrompts
  const countRow = dbInstance.prepare('SELECT COUNT(*) AS count FROM characters').get();
  if (!countRow || countRow.count === 0) {
    if (fs.existsSync(SEED_SQL_PATH)) {
      const seedSql = fs.readFileSync(SEED_SQL_PATH, 'utf8');
      dbInstance.exec(seedSql);

      // Recompile rich system_prompt for all seeded characters
      const rows = dbInstance.prepare('SELECT * FROM characters').all();
      const updateStmt = dbInstance.prepare('UPDATE characters SET system_prompt = ? WHERE id = ?');
      for (const r of rows) {
        const compiled = compileCharacterSystemPrompt(r);
        updateStmt.run(compiled, r.id);
      }
      console.log(`[SQL DB] Initialized schema and seeded ${rows.length} characters into universe.sqlite`);
    }
  }

  return dbInstance;
}

/**
 * Execute a callback inside an atomic SQL transaction
 */
export function runTransaction(fn) {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

/**
 * Close the SQLite database connection cleanly
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}


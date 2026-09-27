#!/usr/bin/env node

/**
 * Database Initialization & Inspection Utility
 * Creates/verifies `backend/db/universe.sqlite` from `schema.sql` & `seed.sql` and prints table stats.
 */
import { DatabaseConnection } from '../backend/db/database.js';
import { characterRepository, chatSessionRepository, personaRepository, memoryRepository } from '../backend/repositories/index.js';

const dbConn = DatabaseConnection.getInstance();
const db = dbConn.connect();

console.log('==============================================================');
console.log('🗄️  My C.AI Universe — Relational SQL Database Initialized');
console.log('==============================================================');
console.log(`📂 Database File : ${dbConn.dbPath}`);
console.log(`👥 Characters    : ${characterRepository.count()} rows`);
console.log(`🎭 User Personas : ${personaRepository.count()} rows`);
console.log(`💬 Chat Sessions : ${chatSessionRepository.count()} rows`);
console.log(`🧠 Memories      : ${memoryRepository.count()} rows`);
console.log('--------------------------------------------------------------');

const chars = characterRepository.findAllFiltered({ sort: 'popular' });
console.log('🌟 Seeded Characters in SQL:');
for (const c of chars) {
  console.log(`  - [${c.id}] ${c.name} (${c.tagline}) | 💬 ${c.interactions} | ❤️ ${c.likes}`);
}
console.log('==============================================================');

dbConn.close();

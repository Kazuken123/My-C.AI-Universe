#!/usr/bin/env node

/**
 * Database Initialization & Inspection Utility
 * Creates/verifies database (Turso or local SQLite) and prints table stats.
 */
import 'dotenv/config';
import { DatabaseConnection } from '../backend/db/database.js';
import { characterRepository, chatSessionRepository, personaRepository, memoryRepository } from '../backend/repositories/index.js';

async function main() {
  const dbConn = DatabaseConnection.getInstance();
  dbConn.connect();
  await dbConn.ensureReady();

  console.log('==============================================================');
  console.log('🗄️  My C.AI Universe — Relational SQL Database Initialized');
  console.log('==============================================================');
  console.log(`🌐 Database Engine: ${dbConn.engineName}`);
  console.log(`👥 Characters    : ${await characterRepository.count()} rows`);
  console.log(`🎭 User Personas : ${await personaRepository.count()} rows`);
  console.log(`💬 Chat Sessions : ${await chatSessionRepository.count()} rows`);
  console.log(`🧠 Memories      : ${await memoryRepository.count()} rows`);
  console.log('--------------------------------------------------------------');

  const chars = await characterRepository.findAllFiltered({ sort: 'popular' });
  console.log('🌟 Seeded Characters in SQL:');
  for (const c of chars) {
    console.log(`  - [${c.id}] ${c.name} (${c.tagline}) | 💬 ${c.interactions} | ❤️ ${c.likes}`);
  }
  console.log('==============================================================');

  dbConn.close();
}

main().catch(err => {
  console.error('Initialization error:', err);
  process.exit(1);
});

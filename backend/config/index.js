import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
export const DB_DIR = path.join(PROJECT_ROOT, 'backend', 'db');

/**
 * Centralized application configuration
 */
export const config = {
  // Server
  PORT: Number(process.env.PORT) || 3000,

  // AI Providers
  AI_PROVIDER: process.env.AI_PROVIDER || 'gemini',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
  MEMORY_SERVICE_URL: process.env.MEMORY_SERVICE_URL || 'http://localhost:5001',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '254873060516-vtieqsbihjcle1lqgpqfp3u5lpgocf7g.apps.googleusercontent.com',

  // Database & Persistence
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || '',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || '',
  DB_PATH: './backend/db/characters.json',
  CHARACTERS_DB_PATH: path.join(DB_DIR, 'characters.json'),
  CHATS_DB_PATH: path.join(DB_DIR, 'chats.json'),
  PERSONAS_DB_PATH: path.join(DB_DIR, 'personas.json'),
  MEMORIES_DB_PATH: path.join(DB_DIR, 'memories.json'),

  // Security: Allowed wiki domains for scraping
  ALLOWED_DOMAINS: [
    'wikipedia.org',
    'fandom.com',
    'translate.goog',
    'wikibooks.org',
    'wikia.com'
  ],

  // Limits
  MAX_MESSAGE_LENGTH: 4000,
  MAX_MEMORY_MESSAGES: 60,
  WIKI_TIMEOUT: 15000, // 15 seconds
  AI_TIMEOUT: 30000,   // 30 seconds

  // Authentication & Security
  JWT_SECRET: process.env.JWT_SECRET || 'cai-universe-secret-jwt-key-autumn-2026',

  // CORS
  CORS_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  ]
};

/**
 * Validate required environment variables
 */
export function validateEnvironment() {
  const required = ['GEMINI_API_KEY'];
  const warnings = [];

  required.forEach(key => {
    if (!process.env[key]) {
      warnings.push(`Missing environment variable: ${key} (required for Gemini AI)`);
    }
  });

  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET environment variable is not defined in production! Set a custom JWT_SECRET to protect user session integrity.');
  }

  if (warnings.length > 0) {
    console.warn('[CONFIG WARNINGS]');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
  }

  return warnings.length === 0;
}

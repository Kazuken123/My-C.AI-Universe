import 'dotenv/config';
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
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  IS_TEST: process.env.NODE_ENV === 'test',
  ROOT_DIR: PROJECT_ROOT,

  // AI Providers
  AI_PROVIDER: process.env.AI_PROVIDER || 'gemini',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
  MEMORY_SERVICE_URL: process.env.MEMORY_SERVICE_URL || 'http://localhost:5001',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

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
    'wikibooks.org',
    'wikia.com'
  ],

  // Limits
  MAX_MESSAGE_LENGTH: 4000,
  MAX_MEMORY_MESSAGES: 60,
  WIKI_TIMEOUT: 15000, // 15 seconds
  AI_TIMEOUT: 30000,   // 30 seconds

  // Administrator Configuration (configured strictly via environment variables)
  ADMIN_USERNAMES: (process.env.ADMIN_USERNAMES || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),

  // Authentication & Security (Fail-closed: dev key allowed ONLY if explicitly development or test)
  JWT_SECRET: process.env.JWT_SECRET || (
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
      ? 'cai-universe-local-dev-jwt-key-never-use-in-production'
      : (() => { throw new Error('FATAL: JWT_SECRET environment variable is required unless NODE_ENV is explicitly set to development or test.'); })()
  ),

  // CORS
  CORS_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000'
  ]
};

/**
 * Immutable canonical reserved usernames across universe authentication and characters
 */
export const RESERVED_USERNAMES = Object.freeze(new Set([
  'community', 'system', 'admin', 'administrator', 'moderator',
  'root', 'support', 'kazuken', 'guest', 'you', 'universe'
]));

export function isAdminIdentity(username = '', email = '') {
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  return (
    (cleanUser && config.ADMIN_USERNAMES.includes(cleanUser)) ||
    (cleanEmail && config.ADMIN_EMAILS.includes(cleanEmail))
  );
}

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

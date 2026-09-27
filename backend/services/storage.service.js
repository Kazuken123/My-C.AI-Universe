import fs from 'fs';
import path from 'path';
import { config, DB_DIR } from '../config/index.js';

/**
 * Ensure DB directory and JSON collection files exist
 */
function ensureDatabaseFiles() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const defaults = [
    { path: config.CHARACTERS_DB_PATH, defaultData: [] },
    { path: config.CHATS_DB_PATH, defaultData: [] },
    {
      path: config.PERSONAS_DB_PATH,
      defaultData: [
        {
          id: 'persona_default',
          name: 'Traveler',
          avatar: '🌟',
          description: 'A curious traveler exploring different worlds and stories.',
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]
    },
    { path: config.MEMORIES_DB_PATH, defaultData: [] }
  ];

  for (const item of defaults) {
    if (!fs.existsSync(item.path)) {
      fs.writeFileSync(item.path, JSON.stringify(item.defaultData, null, 2), 'utf8');
    }
  }
}

/**
 * Read a JSON array file safely
 * @param {string} filePath - Absolute path to JSON file
 * @returns {Array} Parsed array
 */
export function readCollection(filePath) {
  ensureDatabaseFiles();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error(`[STORAGE] Failed to read ${path.basename(filePath)}:`, error.message);
    return [];
  }
}

/**
 * Write a JSON array file atomically
 * @param {string} filePath - Absolute path to JSON file
 * @param {Array} data - Array to serialize
 */
export function writeCollection(filePath, data) {
  ensureDatabaseFiles();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

export const storage = {
  getCharacters: () => readCollection(config.CHARACTERS_DB_PATH),
  saveCharacters: (chars) => writeCollection(config.CHARACTERS_DB_PATH, chars),

  getChats: () => readCollection(config.CHATS_DB_PATH),
  saveChats: (chats) => writeCollection(config.CHATS_DB_PATH, chats),

  getPersonas: () => readCollection(config.PERSONAS_DB_PATH),
  savePersonas: (personas) => writeCollection(config.PERSONAS_DB_PATH, personas),

  getMemories: () => readCollection(config.MEMORIES_DB_PATH),
  saveMemories: (memories) => writeCollection(config.MEMORIES_DB_PATH, memories)
};

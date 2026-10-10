import {
  characterRepository,
  chatSessionRepository,
  personaRepository,
  memoryRepository
} from '../repositories/index.js';
import { DatabaseConnection } from '../db/database.js';

/**
 * StorageService Class (OOP Facade Pattern over Relational SQL Repositories)
 * Coordinates data persistence across CharacterRepository, ChatSessionRepository,
 * PersonaRepository, and MemoryRepository.
 */
export class StorageService {
  constructor({
    charactersRepo = characterRepository,
    chatsRepo = chatSessionRepository,
    personasRepo = personaRepository,
    memoriesRepo = memoryRepository
  } = {}) {
    this.characters = charactersRepo;
    this.chats = chatsRepo;
    this.personas = personasRepo;
    this.memories = memoriesRepo;
  }

  async getCharacters() {
    const chars = await this.characters.findAll();
    return chars.map(c => c.toJSON());
  }

  async saveCharacters(chars) {
    await this.characters.saveAll(chars);
  }

  async getChats() {
    const chats = await this.chats.findAll();
    return chats.map(s => s.toJSON());
  }

  async saveChats(chats) {
    await this.chats.saveAll(chats);
  }

  async getPersonas() {
    const personas = await this.personas.findAll();
    return personas.map(p => p.toJSON());
  }

  async savePersonas(personas) {
    await this.personas.saveAll(personas);
  }

  async getMemories() {
    const memories = await this.memories.findAll();
    return memories.map(m => m.toJSON());
  }

  async saveMemories(memories) {
    await this.memories.saveAll(memories);
  }

  async getSqlStats() {
    const db = this.characters.db;
    const connMgr = DatabaseConnection.getInstance();

    const [charsCount, chatsCount, msgCountRow, varCountRow, personasCount, memCount] = await Promise.all([
      this.characters.count(),
      this.chats.count(),
      db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get(),
      db.prepare('SELECT COUNT(*) AS c FROM message_variants').get(),
      this.personas.count(),
      this.memories.count()
    ]);

    return {
      engine: connMgr.engineName,
      tables: {
        characters: charsCount,
        chat_sessions: chatsCount,
        chat_messages: Number(msgCountRow?.c) || 0,
        message_variants: Number(varCountRow?.c) || 0,
        user_personas: personasCount,
        character_memories: memCount
      }
    };
  }
}

export const storage = new StorageService();

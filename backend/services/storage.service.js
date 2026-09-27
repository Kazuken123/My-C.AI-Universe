import {
  characterRepository,
  chatSessionRepository,
  personaRepository,
  memoryRepository
} from '../repositories/index.js';

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

  getCharacters() {
    return this.characters.findAll().map(c => c.toJSON());
  }

  saveCharacters(chars) {
    this.characters.saveAll(chars);
  }

  getChats() {
    return this.chats.findAll().map(s => s.toJSON());
  }

  saveChats(chats) {
    this.chats.saveAll(chats);
  }

  getPersonas() {
    return this.personas.findAll().map(p => p.toJSON());
  }

  savePersonas(personas) {
    this.personas.saveAll(personas);
  }

  getMemories() {
    return this.memories.findAll().map(m => m.toJSON());
  }

  saveMemories(memories) {
    this.memories.saveAll(memories);
  }

  getSqlStats() {
    const db = this.characters.db;
    return {
      engine: 'SQLite (node:sqlite Relational SQL + OOP Repositories)',
      tables: {
        characters: this.characters.count(),
        chat_sessions: this.chats.count(),
        chat_messages: Number(db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get()?.c) || 0,
        message_variants: Number(db.prepare('SELECT COUNT(*) AS c FROM message_variants').get()?.c) || 0,
        user_personas: this.personas.count(),
        character_memories: this.memories.count()
      }
    };
  }
}

export const storage = new StorageService();

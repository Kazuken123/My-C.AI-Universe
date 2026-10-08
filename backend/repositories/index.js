import { BaseRepository } from './BaseRepository.js';
import { CharacterRepository } from './CharacterRepository.js';
import { ChatSessionRepository } from './ChatSessionRepository.js';
import { PersonaRepository } from './PersonaRepository.js';
import { MemoryRepository } from './MemoryRepository.js';
import { UserRepository, userRepository } from './UserRepository.js';

export const characterRepository = new CharacterRepository();
export const chatSessionRepository = new ChatSessionRepository();
export const personaRepository = new PersonaRepository();
export const memoryRepository = new MemoryRepository();
export { userRepository };

export {
  BaseRepository,
  CharacterRepository,
  ChatSessionRepository,
  PersonaRepository,
  MemoryRepository,
  UserRepository
};

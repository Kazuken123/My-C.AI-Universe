import { BaseRepository } from './BaseRepository.js';
import { CharacterRepository } from './CharacterRepository.js';
import { ChatSessionRepository } from './ChatSessionRepository.js';
import { PersonaRepository } from './PersonaRepository.js';
import { MemoryRepository } from './MemoryRepository.js';
import { UserRepository, userRepository } from './UserRepository.js';
import { PasswordResetRepository, passwordResetRepository } from './PasswordResetRepository.js';
import { MediaAssetRepository, mediaAssetRepository } from './MediaAssetRepository.js';

export const characterRepository = new CharacterRepository();
export const chatSessionRepository = new ChatSessionRepository();
export const personaRepository = new PersonaRepository();
export const memoryRepository = new MemoryRepository();
export const resetRepository = passwordResetRepository;
export { userRepository, passwordResetRepository, mediaAssetRepository };

export {
  BaseRepository,
  CharacterRepository,
  ChatSessionRepository,
  PersonaRepository,
  MemoryRepository,
  UserRepository,
  PasswordResetRepository,
  MediaAssetRepository
};

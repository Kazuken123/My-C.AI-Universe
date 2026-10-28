import { activeMemories, memoryKey, snapshot } from '../services/turn-state.js';
import { BaseController } from './BaseController.js';
import { memoryService } from '../services/memory.service.js';
import { characterRepository, chatSessionRepository } from '../repositories/index.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * MemoryController Class (extends BaseController)
 * Handles HTTP requests for CharacterMemory retrieval, creation, and deletion.
 */
export class MemoryController extends BaseController {
  constructor(service = memoryService, charRepo = characterRepository, sessionRepo = chatSessionRepository) {
    super();
    this.service = service;
    this.charRepo = charRepo;
    this.sessionRepo = sessionRepo;

    this.getMemories = this.getMemories.bind(this);
    this.addMemory = this.addMemory.bind(this);
    this.deleteMemory = this.deleteMemory.bind(this);
  }

  async getMemories(req, res) {
    try {
      const { characterId, sessionId } = req.query;
      const isAdmin = typeof req.user?.isAdmin === 'function' ? req.user.isAdmin() : req.user?.role === 'admin';
      if (!characterId && !sessionId && !isAdmin) {
        throw new ValidationError('characterId or sessionId parameter is required to retrieve memories', 'characterId');
      }

      let verifiedSessionId = null;
      let verifiedSession = null;
      if (sessionId && req.user?.id) {
        const session = await this.sessionRepo.findById(sessionId, req.user.id);
        if (session && (!characterId || session.characterId === characterId)) {
          verifiedSessionId = session.id;
          verifiedSession = session;
        }
      }

      let memories = [];
      if (characterId) {
        memories = await this.service.getMemories(characterId, verifiedSessionId);
      } else if (isAdmin) {
        memories = await this.service.getMemories(null);
      }

      if (verifiedSession) memories = [...memories,...activeMemories(verifiedSession.narrativeState).map(item=>({
        ...item,id:`state:${verifiedSession.id}:${memoryKey(item)}`,characterId:verifiedSession.characterId,sessionId:verifiedSession.id,source:item.kind,visibility:'session'
      }))];
      let storySummary = '';
      if (verifiedSessionId || (sessionId && isAdmin)) {
        const targetSid = verifiedSessionId || sessionId;
        storySummary = await this.service.getSessionStorySummary(targetSid);
      }
      return this.sendJson(res, { memories, count: memories.length, storySummary: storySummary || '' });
    } catch (error) {
      return this.handleError(res, error, 'Failed to load memories');
    }
  }

  async addMemory(req, res) {
    try {
      const { characterId, content, source } = req.body;
      if (!characterId) {
        throw new ValidationError('characterId is required', 'characterId');
      }
      if (!content || !content.trim()) {
        throw new ValidationError('Memory content is required', 'content');
      }
      if (content.length > 2000) {
        throw new ValidationError('Memory content exceeds max length (2000 characters)', 'content');
      }

      const character = await this.charRepo.findById(characterId);
      if (!character) {
        throw new NotFoundError('Character not found');
      }

      // Check centralized domain authorization rule
      if (!character.canModify(req.user)) {
        return this.sendError(res, 'You do not have permission to add memories to this character', 403);
      }

      const ALLOWED_SOURCES = new Set(['conversation', 'manual', 'lore', 'wiki', 'system']);
      const cleanSource = source && ALLOWED_SOURCES.has(String(source).toLowerCase())
        ? String(source).toLowerCase()
        : 'manual';

      const memory = await this.service.addMemory(content.trim(), characterId, cleanSource);
      if (!memory) {
        return this.sendJson(res, { message: 'Memory already exists', duplicate: true }, 200);
      }

      return this.sendJson(res, memory, 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to add memory');
    }
  }

  async deleteMemory(req, res) {
    try {
      if (req.params.id.startsWith('state:')) {
        const [, sessionId, key] = req.params.id.split(':');
        const session = await this.sessionRepo.findById(sessionId,req.user?.id);
        if (!session || !activeMemories(session.narrativeState).some(m=>memoryKey(m)===key)) throw new NotFoundError('Memory not found');
        const before = snapshot(session);
        session.narrativeState.forgottenMemoryKeys = [...new Set([...(session.narrativeState.forgottenMemoryKeys || []),key])];
        session.narrativeState.memories = activeMemories(session.narrativeState);
        session.invalidateSummary = true;
        session.pendingEvent = {kind:'forget',position:session.messages.length-1,messageId:session.messages.at(-1)?.id || null,before};
        await this.sessionRepo.updateRelationshipState(sessionId,{},session);
        return this.sendJson(res,{success:true,deletedId:req.params.id});
      }
      const memory = await this.service.repository.findById(req.params.id);
      if (!memory) {
        throw new NotFoundError('Memory not found');
      }

      const isAdmin = req.user && (typeof req.user.isAdmin === 'function' ? req.user.isAdmin() : req.user.role === 'admin');

      if (memory.sessionId) {
        let isOwner = false;
        if (req.user?.id) {
          const session = await this.sessionRepo.findById(memory.sessionId, req.user.id);
          if (session) isOwner = true;
        }
        if (!isOwner && !isAdmin) {
          return this.sendError(res, 'You do not have permission to delete this session memory', 403);
        }
      } else {
        const character = await this.charRepo.findById(memory.characterId);
        if (!character || !character.canModify(req.user)) {
          return this.sendError(res, 'You do not have permission to delete this memory', 403);
        }
      }

      const deleted = await this.service.deleteMemory(req.params.id);
      if (!deleted) {
        throw new NotFoundError('Memory not found');
      }
      return this.sendJson(res, { success: true, deletedId: req.params.id });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete memory');
    }
  }
}

export const memoryController = new MemoryController();

export const {
  getMemories,
  addMemory,
  deleteMemory
} = memoryController;

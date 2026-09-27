import { BaseController } from './BaseController.js';
import { memoryService } from '../services/memory.service.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * MemoryController Class (extends BaseController)
 * Handles HTTP requests for CharacterMemory retrieval, creation, and deletion.
 */
export class MemoryController extends BaseController {
  constructor(service = memoryService) {
    super();
    this.service = service;

    this.getMemories = this.getMemories.bind(this);
    this.addMemory = this.addMemory.bind(this);
    this.deleteMemory = this.deleteMemory.bind(this);
  }

  getMemories(req, res) {
    try {
      const { characterId } = req.query;
      const memories = this.service.getMemories(characterId || null);
      return this.sendJson(res, { memories, count: memories.length });
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

      const memory = await this.service.addMemory(content.trim(), characterId, source || 'manual');
      if (!memory) {
        return this.sendJson(res, { message: 'Memory already exists', duplicate: true }, 200);
      }

      return this.sendJson(res, memory, 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to add memory');
    }
  }

  deleteMemory(req, res) {
    try {
      const deleted = this.service.deleteMemory(req.params.id);
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

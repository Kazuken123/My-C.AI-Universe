import { memoryService } from '../services/memory.service.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * Get memories (optionally filtered by ?characterId=)
 */
export function getMemories(req, res) {
  try {
    const { characterId } = req.query;
    const memories = memoryService.getMemories(characterId || null);
    res.json({ memories, count: memories.length });
  } catch (error) {
    res.status(500).json({
      error: { message: 'Failed to load memories', code: 500 }
    });
  }
}

/**
 * Manually add a long-term memory for a character
 */
export async function addMemory(req, res) {
  try {
    const { characterId, content, source } = req.body;
    if (!characterId) {
      throw new ValidationError('characterId is required', 'characterId');
    }
    if (!content || !content.trim()) {
      throw new ValidationError('Memory content is required', 'content');
    }

    const memory = await memoryService.addMemory(content.trim(), characterId, source || 'manual');
    if (!memory) {
      return res.status(200).json({ message: 'Memory already exists', duplicate: true });
    }

    res.status(201).json(memory);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to add memory', code }
    });
  }
}

/**
 * Delete a memory by ID
 */
export function deleteMemory(req, res) {
  try {
    const { id } = req.params;
    const deleted = memoryService.deleteMemory(id);
    if (!deleted) {
      throw new NotFoundError('Memory not found');
    }
    res.json({ success: true, deletedId: id });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to delete memory', code }
    });
  }
}

import crypto from 'node:crypto';
import { BaseEntity } from './BaseEntity.js';
import { ValidationError } from '../ai/errors.js';

/**
 * CharacterMemory Domain Entity Class
 * Represents a long-term factual or episodic memory belonging to a Character.
 */
export class CharacterMemory extends BaseEntity {
  constructor(props = {}) {
    super({
      id: props.id || `mem_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      createdAt: props.createdAt || props.created_at
    });
    this.characterId = props.characterId || props.character_id;
    this.sessionId = props.sessionId || props.session_id || null;
    this.content = (props.content || '').trim();
    this.source = props.source || 'conversation';
    this.similarity = props.similarity !== undefined ? Number(props.similarity) : undefined;
  }

  validate() {
    if (!this.characterId) {
      throw new ValidationError('characterId is required for CharacterMemory', 'characterId');
    }
    if (!this.content || !this.content.trim()) {
      throw new ValidationError('Memory content is required', 'content');
    }
    if (this.content.length > 5000) {
      throw new ValidationError('Memory content too long (max 5000 characters)', 'content');
    }
    return true;
  }

  static fromDatabaseRow(row) {
    if (!row) return null;
    return new CharacterMemory({
      id: row.id,
      characterId: row.character_id,
      sessionId: row.session_id,
      content: row.content,
      source: row.source,
      createdAt: row.created_at
    });
  }

  toJSON() {
    const obj = {
      id: this.id,
      characterId: this.characterId,
      sessionId: this.sessionId,
      content: this.content,
      source: this.source,
      createdAt: this.createdAt
    };
    if (this.similarity !== undefined) {
      obj.similarity = this.similarity;
    }
    return obj;
  }
}

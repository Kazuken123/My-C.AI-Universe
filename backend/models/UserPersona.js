import crypto from 'node:crypto';
import { BaseEntity } from './BaseEntity.js';
import { ValidationError } from '../ai/errors.js';

/**
 * UserPersona Domain Entity Class
 * Represents the user's active roleplay identity.
 */
export class UserPersona extends BaseEntity {
  constructor(props = {}) {
    super({
      id: props.id || `persona_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      createdAt: props.createdAt || props.created_at,
      updatedAt: props.updatedAt || props.updated_at
    });

    this.userId = props.userId || props.user_id || null;
    this.name = (props.name || '').trim();
    this.avatar = (props.avatar || '').trim() || '🌟';
    this.description = (props.description || '').trim();
    this.isDefault = Boolean(props.isDefault ?? props.is_default ?? false);
  }

  validate() {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationError('Persona name is required', 'name');
    }
    if (this.name.length > 100) {
      throw new ValidationError('Persona name too long (max 100 characters)', 'name');
    }
    if (this.description && this.description.length > 2000) {
      throw new ValidationError('Persona description too long (max 2000 characters)', 'description');
    }
    if (this.avatar && this.avatar.length > 100000) {
      throw new ValidationError('Avatar identifier too long (max 100000 characters)', 'avatar');
    }
    return true;
  }

  activate() {
    this.isDefault = true;
    this.touch();
  }

  deactivate() {
    this.isDefault = false;
    this.touch();
  }

  static fromDatabaseRow(row) {
    if (!row) return null;
    return new UserPersona({
      id: row.id,
      userId: row.user_id || null,
      name: row.name,
      avatar: row.avatar,
      description: row.description,
      isDefault: Boolean(row.is_default),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      avatar: this.avatar,
      description: this.description,
      isDefault: this.isDefault,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

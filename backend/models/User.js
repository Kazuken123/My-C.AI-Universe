import crypto from 'node:crypto';
import { ValidationError } from '../ai/errors.js';

/**
 * User Entity Model Class (OOP Encapsulation for Authentication & User Profile)
 */
export class User {
  constructor({
    id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username = '',
    passwordHash = '',
    displayName = '',
    avatar = '👤',
    createdAt = new Date().toISOString(),
    updatedAt = new Date().toISOString()
  } = {}) {
    this.id = String(id);
    this.username = String(username).trim().toLowerCase();
    this.passwordHash = String(passwordHash);
    this.displayName = String(displayName).trim() || this.username;
    this.avatar = String(avatar).trim() || '👤';
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Validate user constraints
   */
  validate() {
    if (!this.username || this.username.length < 3 || this.username.length > 30) {
      throw new ValidationError('Username must be between 3 and 30 characters', 'username');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(this.username)) {
      throw new ValidationError('Username may only contain letters, numbers, and underscores', 'username');
    }
    if (!this.displayName || this.displayName.length < 1 || this.displayName.length > 50) {
      throw new ValidationError('Display name must be between 1 and 50 characters', 'displayName');
    }
  }

  /**
   * Cryptographically hash a plaintext password with a random salt (scrypt)
   * @param {string} password
   * @returns {string} salt:hash format
   */
  static hashPassword(password) {
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new ValidationError('Password must be at least 6 characters long', 'password');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verify plaintext password against the stored salt:hash in timing-safe manner
   * @param {string} password
   * @returns {boolean}
   */
  verifyPassword(password) {
    if (!password || !this.passwordHash || !this.passwordHash.includes(':')) {
      return false;
    }
    try {
      const [salt, originalHash] = this.passwordHash.split(':');
      const testKey = crypto.scryptSync(password, salt, 64);
      const originalKeyBuf = Buffer.from(originalHash, 'hex');
      return crypto.timingSafeEqual(originalKeyBuf, testKey);
    } catch {
      return false;
    }
  }

  touch() {
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Safe serialization without password hash
   */
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      avatar: this.avatar,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Factory method to reconstruct User from SQL database row
   */
  static fromDatabaseRow(row) {
    if (!row) return null;
    return new User({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name,
      avatar: row.avatar,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
}

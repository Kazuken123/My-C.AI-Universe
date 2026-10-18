import crypto from 'node:crypto';

/**
 * Abstract Base Entity Class (OOP Inheritance Root)
 * Encapsulates common identity, audit timestamps, and serialization contracts for all domain models.
 */
export class BaseEntity {
  /**
   * @param {Object} props
   * @param {string} [props.id]
   * @param {string} [props.createdAt]
   * @param {string} [props.updatedAt]
   */
  constructor({ id = null, createdAt = null, updatedAt = null } = {}) {
    if (new.target === BaseEntity) {
      throw new TypeError('Cannot instantiate abstract class BaseEntity directly');
    }
    const now = new Date().toISOString();
    this.id = id ? String(id) : this.generateId();
    this.createdAt = createdAt || now;
    this.updatedAt = updatedAt || now;
  }

  /**
   * Generate a cryptographically strong unique identifier (64-bit CSPRNG entropy)
   * @returns {string}
   */
  generateId() {
    return `${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Update the entity modification timestamp
   */
  touch() {
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Polymorphic validation hook for subclasses
   */
  validate() {
    return true;
  }

  /**
   * Convert entity to plain JSON object for API responses
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Convert entity to relational database row object
   * @returns {Object}
   */
  toDatabaseRow() {
    return {
      id: this.id,
      created_at: this.createdAt,
      updated_at: this.updatedAt
    };
  }
}

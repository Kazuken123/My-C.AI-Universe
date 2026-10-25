import { BaseRepository } from './BaseRepository.js';

/**
 * PasswordResetRepository Class (extends BaseRepository)
 * Encapsulates relational SQL queries for the password_resets table.
 */
export class PasswordResetRepository extends BaseRepository {
  constructor() {
    super('password_resets');
  }

  /**
   * Invalidate all unexpired/unused reset codes for an email address
   * @param {string} email
   * @param {Object} [targetDb]
   * @returns {Promise<number>}
   */
  async invalidateByEmail(email, targetDb = null) {
    const conn = targetDb || this.db;
    const result = await conn.prepare(`
      UPDATE password_resets
      SET used = 1
      WHERE email = ? COLLATE NOCASE AND used = 0
    `).run(email);
    return result.changes || 0;
  }

  /**
   * Insert a new password reset OTP record
   * @param {Object} param0
   * @param {Object} [targetDb]
   * @returns {Promise<void>}
   */
  async createReset({ id, email, code, expiresAt }, targetDb = null) {
    const conn = targetDb || this.db;
    await conn.prepare(`
      INSERT INTO password_resets (id, email, code, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, email, code, expiresAt, new Date().toISOString());
  }

  /**
   * Find the most recent active and unused OTP for an email and code
   * @param {string} email
   * @param {string} code
   * @param {Object} [targetDb]
   * @returns {Promise<Object|null>}
   */
  async findActiveByEmailAndCode(email, code, targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare(`
      SELECT * FROM password_resets
      WHERE email = ? COLLATE NOCASE AND code = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(email, code);
    return row || null;
  }

  /**
   * Mark a specific reset code record as used by email and code
   * @param {string} email
   * @param {string} code
   * @param {Object} [targetDb]
   * @returns {Promise<boolean>}
   */
  async markUsedByEmailAndCode(email, code, targetDb = null) {
    const conn = targetDb || this.db;
    const result = await conn.prepare(`
      UPDATE password_resets SET used = 1
      WHERE email = ? COLLATE NOCASE AND code = ?
    `).run(email, code);
    return result.changes > 0;
  }

  /**
   * Mark a specific reset code record as used
   * @param {string} id
   * @param {Object} [targetDb]
   * @returns {Promise<boolean>}
   */
  async markUsed(id, targetDb = null) {
    const conn = targetDb || this.db;
    const result = await conn.prepare(`
      UPDATE password_resets
      SET used = 1
      WHERE id = ?
    `).run(id);
    return result.changes > 0;
  }
}

export const passwordResetRepository = new PasswordResetRepository();

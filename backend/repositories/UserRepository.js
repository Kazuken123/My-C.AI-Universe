import { BaseRepository } from './BaseRepository.js';
import { User } from '../models/User.js';

/**
 * UserRepository Class (extends BaseRepository)
 * Manages relational SQL persistence for User entities.
 */
export class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  /**
   * Create a new user in SQL database
   * @param {User|Object} userObj
   * @param {Object} [targetDb]
   * @returns {Promise<User>}
   */
  async create(userObj, targetDb = null) {
    const conn = targetDb || this.db;
    const user = userObj instanceof User ? userObj : new User(userObj);
    user.validate();

    const stmt = conn.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, avatar, role, auth_provider, provider_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      user.id,
      user.username,
      user.email || null,
      user.passwordHash,
      user.displayName,
      user.avatar,
      user.role || 'user',
      user.authProvider,
      user.providerId || null,
      user.createdAt,
      user.updatedAt
    );

    return user;
  }

  /**
   * Find user by unique username (case-insensitive)
   * @param {string} username
   * @param {Object} [targetDb]
   * @returns {Promise<User|null>}
   */
  async findByUsername(username, targetDb = null) {
    if (!username) return null;
    const conn = targetDb || this.db;
    const clean = String(username).trim().toLowerCase();
    const row = await conn
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .get(clean);
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by email (case-insensitive)
   * @param {string} email
   * @param {Object} [targetDb]
   * @returns {Promise<User|null>}
   */
  async findByEmail(email, targetDb = null) {
    if (!email) return null;
    const conn = targetDb || this.db;
    const clean = String(email).trim().toLowerCase();
    const row = await conn
      .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1')
      .get(clean);
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by social provider and provider user ID
   * @param {string} provider
   * @param {string} providerId
   * @param {Object} [targetDb]
   * @returns {Promise<User|null>}
   */
  async findByProvider(provider, providerId, targetDb = null) {
    if (!provider || !providerId) return null;
    const conn = targetDb || this.db;
    const row = await conn
      .prepare('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ? LIMIT 1')
      .get(String(provider).toLowerCase(), String(providerId));
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by ID
   * @param {string} id
   * @param {Object} [targetDb]
   * @returns {Promise<User|null>}
   */
  async findById(id, targetDb = null) {
    if (!id) return null;
    const conn = targetDb || this.db;
    const row = await conn.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return User.fromDatabaseRow(row);
  }

  /**
   * Find all users ordered by creation date
   * @param {Object} [targetDb]
   * @returns {Promise<User[]>}
   */
  async findAll(targetDb = null) {
    const conn = targetDb || this.db;
    const rows = await conn.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    return rows.map(r => User.fromDatabaseRow(r));
  }

  /**
   * Update user details
   * @param {User} user
   * @param {Object} [targetDb]
   * @returns {Promise<User>}
   */
  async update(user, targetDb = null) {
    const conn = targetDb || this.db;
    user.validate();
    user.touch();
    const stmt = conn.prepare(`
      UPDATE users SET
        username = ?,
        email = ?,
        display_name = ?,
        avatar = ?,
        password_hash = ?,
        auth_provider = ?,
        provider_id = ?,
        updated_at = ?
      WHERE id = ?
    `);
    await stmt.run(
      user.username,
      user.email || null,
      user.displayName,
      user.avatar,
      user.passwordHash,
      user.authProvider || 'local',
      user.providerId || null,
      user.updatedAt,
      user.id
    );
    return user;
  }

  /**
   * Update user role specifically (Admin privileged operation)
   * @param {string} userId
   * @param {'admin'|'user'} newRole
   * @param {Object} [targetDb]
   */
  async updateRole(userId, newRole, targetDb = null) {
    if (!['user', 'admin'].includes(newRole)) {
      throw new Error(`Invalid user role: ${newRole}`);
    }
    const conn = targetDb || this.db;
    const updatedAt = new Date().toISOString();
    await conn.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(newRole, updatedAt, userId);
  }

  /**
   * Count total administrator accounts in the system
   * @param {Object} [targetDb]
   * @returns {Promise<number>}
   */
  async countAdmins(targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get();
    return Number(row?.count) || 0;
  }

  /**
   * Update password hash directly
   * @param {string} userId
   * @param {string} newPasswordHash
   * @param {Object} [targetDb]
   */
  async updatePassword(userId, newPasswordHash, targetDb = null) {
    const conn = targetDb || this.db;
    const updatedAt = new Date().toISOString();
    const stmt = conn.prepare(`
      UPDATE users SET
        password_hash = ?,
        updated_at = ?
      WHERE id = ?
    `);
    await stmt.run(newPasswordHash, updatedAt, userId);
  }
}

export const userRepository = new UserRepository();

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
   * @returns {User}
   */
  create(userObj) {
    const user = userObj instanceof User ? userObj : new User(userObj);
    user.validate();

    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, password_hash, display_name, avatar, auth_provider, provider_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.username,
      user.email || null,
      user.passwordHash,
      user.displayName,
      user.avatar,
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
   * @returns {User|null}
   */
  findByUsername(username) {
    if (!username) return null;
    const clean = String(username).trim().toLowerCase();
    const row = this.db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .get(clean);
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by email (case-insensitive)
   * @param {string} email
   * @returns {User|null}
   */
  findByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1')
      .get(clean);
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by social provider and provider user ID
   * @param {string} provider
   * @param {string} providerId
   * @returns {User|null}
   */
  findByProvider(provider, providerId) {
    if (!provider || !providerId) return null;
    const row = this.db
      .prepare('SELECT * FROM users WHERE auth_provider = ? AND provider_id = ? LIMIT 1')
      .get(String(provider).toLowerCase(), String(providerId));
    return User.fromDatabaseRow(row);
  }

  /**
   * Find user by ID
   * @param {string} id
   * @returns {User|null}
   */
  findById(id) {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return User.fromDatabaseRow(row);
  }

  /**
   * Update user details
   * @param {User} user
   * @returns {User}
   */
  update(user) {
    user.validate();
    user.touch();
    const stmt = this.db.prepare(`
      UPDATE users SET
        email = ?,
        display_name = ?,
        avatar = ?,
        password_hash = ?,
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(user.email || null, user.displayName, user.avatar, user.passwordHash, user.updatedAt, user.id);
    return user;
  }

  /**
   * Update password hash directly
   * @param {string} userId
   * @param {string} newPasswordHash
   */
  updatePassword(userId, newPasswordHash) {
    const updatedAt = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE users SET
        password_hash = ?,
        updated_at = ?
      WHERE id = ?
    `);
    stmt.run(newPasswordHash, updatedAt, userId);
  }
}

export const userRepository = new UserRepository();

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'path';
import { User } from '../models/User.js';
import { UserPersona } from '../models/UserPersona.js';
import { userRepository, personaRepository } from '../repositories/index.js';
import { getDatabase } from '../db/database.js';
import { emailService } from './email.service.js';
import { AuthenticationError, ConflictError, ValidationError, NotFoundError } from '../ai/errors.js';
import { config, isAdminIdentity } from '../config/index.js';

const JWT_SECRET = config.JWT_SECRET;
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Base64URL helper
 */
function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

/**
 * AuthService Class (OOP Authentication, Session Token & Account Lifecycle Manager)
 */
export class AuthService {
  constructor(userRepo = userRepository, personaRepo = personaRepository) {
    this.userRepo = userRepo;
    this.personaRepo = personaRepo;
  }

  /**
   * Create a signed JWT token for a user
   * @param {User} user
   * @returns {string}
   */
  generateToken(user) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role || 'user',
      exp: Date.now() + TOKEN_TTL_MS
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify and decode a JWT token
   * @param {string} token
   * @returns {Object} payload
   */
  verifyToken(token) {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Token missing or invalid');
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthenticationError('Malformed token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new AuthenticationError('Invalid token signature');
    }

    let payload;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
      throw new AuthenticationError('Invalid token payload');
    }

    if (payload.exp && Date.now() > payload.exp) {
      throw new AuthenticationError('Session token expired');
    }

    return payload;
  }

  /**
   * Register a new user, create a clean starter persona, and return session token
   * @param {Object} param0
   * @returns {Promise<{ user: Object, token: string }>}
   */
  async register({ username, email, password, displayName, avatar = '👤' }) {
    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanEmail = email ? String(email).trim().toLowerCase() : '';

    const RESERVED_USERNAMES = new Set([
      'community', 'system', 'admin', 'administrator', 'moderator',
      'root', 'support', 'universe', 'kazuken', 'guest'
    ]);
    if (RESERVED_USERNAMES.has(cleanUsername)) {
      throw new ValidationError(`Username "${cleanUsername}" is reserved and cannot be registered`, 'username');
    }
    const existing = await this.userRepo.findByUsername(cleanUsername);
    if (existing) {
      throw new ConflictError(`Username "${cleanUsername}" is already taken`);
    }

    if (cleanEmail) {
      const existingEmail = await this.userRepo.findByEmail(cleanEmail);
      if (existingEmail) {
        throw new ConflictError(`Email "${cleanEmail}" is already registered`);
      }
    }

    const passwordHash = User.hashPassword(password);
    const user = new User({
      username: cleanUsername,
      email: cleanEmail || null,
      passwordHash,
      displayName: displayName || cleanUsername,
      avatar,
      role: 'user'
    });

    const savedUser = await this.userRepo.create(user);

    // Give the new user a fresh personal starter persona
    const starterPersona = new UserPersona({
      userId: savedUser.id,
      name: savedUser.displayName || 'Adventurer',
      avatar: '🌟',
      description: `Default roleplay identity for @${savedUser.username}. Customize or create more in Personas!`,
      isDefault: true
    });
    await this.personaRepo.save(starterPersona, savedUser.id);

    const token = this.generateToken(savedUser);
    return {
      user: savedUser.toJSON(),
      token
    };
  }

  /**
   * Log in an existing user and return session token
   * @param {Object} param0
   * @returns {Promise<{ user: Object, token: string }>}
   */
  async login({ username, password }) {
    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const user = await this.userRepo.findByUsername(cleanUsername);
    if (!user || !user.verifyPassword(password)) {
      throw new AuthenticationError('Invalid username or password');
    }

    const token = this.generateToken(user);
    return {
      user: user.toJSON(),
      token
    };
  }

  /**
   * Update user profile: display name, username, and avatar
   * @param {Object} param0
   * @returns {Promise<Object>}
   */
  async updateProfile({ userId, displayName, username, avatar }) {
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    if (displayName !== undefined) {
      const cleanName = String(displayName).trim();
      if (!cleanName || cleanName.length > 50) {
        throw new ValidationError('Display name must be between 1 and 50 characters');
      }
      user.displayName = cleanName;
    }
    if (username !== undefined) {
      const cleanUsername = String(username).trim().toLowerCase();
      if (!/^[a-zA-Z0-9_]{3,25}$/.test(cleanUsername)) {
        throw new ValidationError('Username must be 3 to 25 characters and contain only letters, numbers, and underscores', 'username');
      }
      const RESERVED_USERNAMES = new Set(['community', 'system', 'admin', 'administrator', 'moderator', 'root', 'support', 'universe']);
      if (RESERVED_USERNAMES.has(cleanUsername) && !user.isAdmin()) {
        throw new ValidationError(`Username "${cleanUsername}" is reserved and cannot be claimed`, 'username');
      }
      const existing = await this.userRepo.findByUsername(cleanUsername);
      if (existing && existing.id !== user.id) {
        throw new ValidationError('Username is already taken by another user', 'username');
      }
      user.username = cleanUsername;
    }
    if (avatar !== undefined) {
      user.avatar = String(avatar).trim().slice(0, 100000);
    }
    await this.userRepo.update(user);
    return user.toJSON();
  }

  /**
   * Authenticate via Social OAuth (Google / Facebook)
   * Auto-links existing accounts by email/providerId or creates a new user with default persona
   * @param {Object} param0
   * @returns {Promise<{ user: Object, token: string, isNewUser: boolean }>}
   */
  async socialAuth({ provider, providerId, email, name, avatar, token }) {
    const cleanProvider = String(provider || '').trim().toLowerCase();
    if (!['google', 'facebook'].includes(cleanProvider)) {
      throw new ValidationError('Authentication provider must be either google or facebook', 'provider');
    }

    let profileEmail = email ? String(email).trim().toLowerCase() : '';
    let profileId = providerId ? String(providerId).trim() : '';
    let profileName = name ? String(name).trim() : '';
    let profileAvatar = avatar ? String(avatar).trim() : (cleanProvider === 'google' ? '🌐' : '📘');

    // If token provided, verify with provider if possible
    if (token && cleanProvider === 'google') {
      try {
        let verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
        if (verifyRes.ok) {
          const payload = await verifyRes.json();
          profileId = payload.sub || profileId;
          profileEmail = payload.email || profileEmail;
          profileName = payload.name || profileName;
          profileAvatar = payload.picture || profileAvatar;
        } else {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            profileId = userinfo.sub || profileId;
            profileEmail = userinfo.email || profileEmail;
            profileName = userinfo.name || profileName;
            profileAvatar = userinfo.picture || profileAvatar;
          }
        }
      } catch {
        // Fallback to client payload
      }
    } else if (token && cleanProvider === 'facebook') {
      try {
        const verifyRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`);
        if (verifyRes.ok) {
          const payload = await verifyRes.json();
          profileId = payload.id || profileId;
          profileEmail = payload.email || profileEmail;
          profileName = payload.name || profileName;
          profileAvatar = payload.picture?.data?.url || profileAvatar;
        }
      } catch {
        // Fallback to client payload
      }
    }

    if (!profileId && !profileEmail) {
      throw new ValidationError('Social authentication requires a provider ID or email');
    }

    // 1. Look up user by provider and providerId
    let user = profileId ? await this.userRepo.findByProvider(cleanProvider, profileId) : null;

    // 2. Look up user by email if not found
    if (!user && profileEmail) {
      user = await this.userRepo.findByEmail(profileEmail);
    }

    // 3. Look up user by username if not found
    if (!user && profileEmail) {
      const derivedUsername = profileEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      user = await this.userRepo.findByUsername(derivedUsername);
    }

    if (user) {
      user.authProvider = cleanProvider;
      user.providerId = profileId || user.providerId;
      if (!user.email && profileEmail) user.email = profileEmail;
      await this.userRepo.update(user);

      // Ensure user has an active persona configured
      const personas = await this.personaRepo.findAll(user.id);
      if (!personas || personas.length === 0) {
        try {
          const defaultPersona = new UserPersona({
            userId: user.id,
            name: user.displayName || user.username,
            avatar: '🌟',
            description: `Default roleplay identity for @${user.username}. Customize or create more in Personas!`,
            isDefault: true
          });
          await this.personaRepo.save(defaultPersona, user.id);
        } catch {
          // ignore
        }
      }

      const sessionToken = this.generateToken(user);
      return {
        user: user.toJSON(),
        token: sessionToken,
        isNewUser: false
      };
    }

    // 3. New user: generate a clean unique username
    let baseUsername = '';
    if (profileEmail) {
      baseUsername = profileEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    } else if (profileName) {
      baseUsername = profileName.replace(/[^a-zA-Z0-9_]/g, '_');
    } else {
      baseUsername = `${cleanProvider}_user`;
    }
    if (baseUsername.length < 3) baseUsername = `${baseUsername}_cai`;
    if (baseUsername.length > 20) baseUsername = baseUsername.slice(0, 20);

    let finalUsername = baseUsername.toLowerCase();
    let suffix = 1;
    while (await this.userRepo.findByUsername(finalUsername)) {
      finalUsername = `${baseUsername}_${suffix++}`.toLowerCase();
    }

    const dummyPasswordHash = User.hashPassword(crypto.randomBytes(24).toString('hex'));
    const newUser = new User({
      username: finalUsername,
      email: profileEmail || null,
      passwordHash: dummyPasswordHash,
      displayName: profileName || finalUsername,
      avatar: profileAvatar,
      role: 'user',
      authProvider: cleanProvider,
      providerId: profileId || null
    });

    const savedUser = await this.userRepo.create(newUser);

    const starterPersona = new UserPersona({
      userId: savedUser.id,
      name: savedUser.displayName || 'Adventurer',
      avatar: '🌟',
      description: `Default roleplay identity for @${savedUser.username}. Customize or create more in Personas!`,
      isDefault: true
    });
    await this.personaRepo.save(starterPersona, savedUser.id);

    const sessionToken = this.generateToken(savedUser);
    return {
      user: savedUser.toJSON(),
      token: sessionToken,
      isNewUser: true
    };
  }

  /**
   * Generate 6-digit OTP and send Password Reset Email
   * @param {Object} param0
   * @returns {Promise<Object>}
   */
  async requestPasswordReset({ email, baseUrl }) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', 'email');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    let user = await this.userRepo.findByEmail(cleanEmail);

    if (!user) {
      user = await this.userRepo.findByUsername(cleanEmail);
    }

    if (!user) {
      throw new NotFoundError('No account found with this email or username');
    }

    const targetEmail = user.email || cleanEmail;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      throw new ValidationError('This account does not have a valid email configured to receive verification codes');
    }

    // Generate 6-digit OTP
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const id = `reset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const db = getDatabase();
    await db.prepare(`
      INSERT INTO password_resets (id, email, code, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(id, targetEmail, code, expiresAt, new Date().toISOString());

    const emailResult = await emailService.sendPasswordResetOtp({
      email: targetEmail,
      code,
      baseUrl
    });

    return {
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
      email: targetEmail,
      previewCode: emailResult.previewCode
    };
  }

  /**
   * Verify whether an OTP code is valid and unexpired
   * @param {Object} param0
   * @returns {Promise<{ valid: boolean }>}
   */
  async verifyResetCode({ email, code }) {
    if (!email || !code) {
      throw new ValidationError('Email and verification code are required');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    const db = getDatabase();
    const row = await db.prepare(`
      SELECT * FROM password_resets
      WHERE email = ? COLLATE NOCASE AND code = ? AND used = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(cleanEmail, cleanCode);

    if (!row) {
      throw new ValidationError('Invalid or previously used verification code');
    }

    if (Date.now() > new Date(row.expires_at).getTime()) {
      throw new ValidationError('Verification code has expired');
    }

    return { valid: true };
  }

  /**
   * Set a new password using a verified OTP code
   * @param {Object} param0
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async resetPassword({ email, code, newPassword }) {
    await this.verifyResetCode({ email, code });

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new ValidationError('New password must contain at least 6 characters', 'newPassword');
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = (await this.userRepo.findByEmail(cleanEmail)) || (await this.userRepo.findByUsername(cleanEmail));
    if (!user) {
      throw new NotFoundError('User account not found');
    }

    const newHash = User.hashPassword(newPassword);
    await this.userRepo.updatePassword(user.id, newHash);

    const db = getDatabase();
    await db.prepare(`
      UPDATE password_resets SET used = 1
      WHERE email = ? COLLATE NOCASE AND code = ?
    `).run(cleanEmail, String(code).trim());

    return {
      success: true,
      message: 'Password changed successfully. You can now sign in.'
    };
  }

  /**
   * Save uploaded base64 data URL avatar image to static storage
   * @param {string} dataUrl
   * @returns {{ url: string, filename: string, size: number }}
   */
  async saveBase64Avatar(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new ValidationError('Invalid image payload; expected data:image/ base64 URL');
    }

    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/i);
    if (!matches || matches.length !== 3) {
      throw new ValidationError('Invalid data URL image format');
    }

    const sub = matches[1].toLowerCase();
    let ext = 'jpg';
    let mimeType = `image/${sub}`;
    if (sub === 'jpeg' || sub === 'jpg') {
      ext = 'jpg';
      mimeType = 'image/jpeg';
    } else if (sub === 'png') {
      ext = 'png';
      mimeType = 'image/png';
    } else if (sub === 'webp') {
      ext = 'webp';
      mimeType = 'image/webp';
    } else if (sub === 'gif') {
      ext = 'gif';
      mimeType = 'image/gif';
    } else if (sub === 'svg' || sub === 'svg+xml') {
      ext = 'svg';
      mimeType = 'image/svg+xml';
    } else {
      ext = sub.replace(/[^a-z0-9]/g, '') || 'jpg';
    }

    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      throw new ValidationError('Uploaded image size exceeds 5MB limit');
    }

    const avatarsDir = path.resolve('frontend', 'assets', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      try {
        fs.mkdirSync(avatarsDir, { recursive: true });
      } catch {}
    }

    const filename = `avatar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const filePath = path.join(avatarsDir, filename);
    try {
      fs.writeFileSync(filePath, buffer);
    } catch (fsErr) {
      console.warn('[AuthService] Local filesystem cache write notice:', fsErr.message);
    }

    // Persist to relational SQL database (Turso libSQL / SQLite) for cloud durability
    try {
      const db = getDatabase();
      await db.prepare(`
        INSERT OR REPLACE INTO media_assets (id, filename, mime_type, data_base64, size, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `asset_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        filename,
        mimeType,
        base64Data,
        buffer.length,
        new Date().toISOString()
      );
    } catch (dbErr) {
      console.warn('[AuthService] Could not persist media asset to SQL DB:', dbErr.message);
    }

    return {
      url: `/assets/avatars/${filename}`,
      filename,
      size: buffer.length
    };
  }

  /**
   * Save uploaded avatar (alias for test and client compatibility)
   */
  async saveUploadedAvatar(image) {
    return await this.saveBase64Avatar(image);
  }

  /**
   * Retrieve active user entity from a Bearer token
   * @param {string} token
   * @returns {Promise<User|null>}
   */
  async getUserFromToken(token) {
    try {
      const payload = this.verifyToken(token);
      return await this.userRepo.findById(payload.sub);
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();

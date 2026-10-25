import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'path';
import { User } from '../models/User.js';
import { UserPersona } from '../models/UserPersona.js';
import { userRepository, personaRepository, passwordResetRepository, mediaAssetRepository } from '../repositories/index.js';
import { emailService } from './email.service.js';
import { AuthenticationError, ConflictError, ValidationError, NotFoundError } from '../ai/errors.js';
import { config, isAdminIdentity, RESERVED_USERNAMES } from '../config/index.js';

export { RESERVED_USERNAMES };

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
  constructor(
    userRepo = userRepository,
    personaRepo = personaRepository,
    passwordResetRepo = passwordResetRepository,
    mediaAssetRepo = mediaAssetRepository
  ) {
    this.userRepo = userRepo;
    this.personaRepo = personaRepo;
    this.passwordResetRepo = passwordResetRepo;
    this.mediaAssetRepo = mediaAssetRepo;
    this.failedResetAttempts = new Map();
  }

  /**
   * Validate whether an avatar input string is safe against XSS and protocol smuggling
   * @param {string} avatar
   * @returns {boolean}
   */
  static isSafeAvatar(avatar) {
    if (!avatar || typeof avatar !== 'string') return false;
    const str = avatar.trim();
    if (!str) return false;
    // Allow short glyphs / emojis (<= 8 chars) that contain no dangerous script/markup symbols
    if (str.length <= 8 && !/[<>"'\/\\&;:]/.test(str)) {
      return true;
    }
    // Allow safe http/https URLs, relative paths starting with single /, or safe raster data URLs
    const SAFE_URL_REGEX = /^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$)/i;
    return SAFE_URL_REGEX.test(str);
  }

  /**
   * Mask an email address to protect privacy during password reset queries
   * @param {string} email
   * @returns {string}
   */
  static maskEmail(email) {
    if (!email || typeof email !== 'string') return '';
    const parts = email.split('@');
    if (parts.length !== 2) return email;
    const [name, domain] = parts;
    if (name.length <= 2) {
      return `${name[0] || '*'}***@${domain}`;
    }
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }

  /**
   * Create a signed JWT token for a user
   * @param {User} user
   * @returns {string}
   */
  generateToken(user) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const pwdFingerprint = user.passwordHash
      ? crypto.createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 12)
      : '';
    const payload = {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role || 'user',
      pwd: pwdFingerprint,
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

    if (avatar) {
      const cleanAvatar = String(avatar).trim();
      if (!AuthService.isSafeAvatar(cleanAvatar)) {
        throw new ValidationError('Invalid avatar URL or format', 'avatar');
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
      const cleanAvatar = String(avatar).trim();
      if (cleanAvatar && !AuthService.isSafeAvatar(cleanAvatar)) {
        throw new ValidationError('Invalid avatar URL or format', 'avatar');
      }
      user.avatar = cleanAvatar.slice(0, 100000);
    }
    await this.userRepo.update(user);
    return user.toJSON();
  }

  /**
   * Authenticate via Social OAuth (Google / Facebook)
   * Strictly verifies cryptographic provider token before trusting identity claims.
   * Auto-links existing accounts by verified email (matching provider only) or creates new user.
   * @param {Object} param0
   * @returns {Promise<{ user: Object, token: string, isNewUser: boolean }>}
   */
  async socialAuth({ provider, providerId, email, name, avatar, token } = {}) {
    const cleanProvider = String(provider || '').trim().toLowerCase();
    if (!['google', 'facebook'].includes(cleanProvider)) {
      throw new ValidationError('Unsupported social authentication provider', 'provider');
    }

    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new AuthenticationError('Valid OAuth provider token is required');
    }

    let verifiedEmail = '';
    let verifiedName = '';
    let verifiedAvatar = '';
    let verifiedProviderId = '';

    // Deterministic mock strictly gated to automated test suite
    if (
      config.IS_TEST &&
      token === 'test_mock_google_oauth_token' &&
      cleanProvider === 'google'
    ) {
      verifiedEmail = String(email || '').trim().toLowerCase();
      verifiedName = String(name || '').trim();
      verifiedAvatar = String(avatar || '').trim();
      verifiedProviderId = String(providerId || '').trim();
    } else if (cleanProvider === 'google') {
      let tokenRes;
      try {
        const isJwtIdToken = token.split('.').length === 3;
        const verifyEndpoint = isJwtIdToken
          ? `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
          : `https://www.googleapis.com/oauth2/v3/userinfo`;
        const fetchOpts = isJwtIdToken
          ? {}
          : { headers: { Authorization: `Bearer ${token}` } };

        tokenRes = await fetch(verifyEndpoint, fetchOpts);
      } catch {
        throw new AuthenticationError('Failed to contact Google OAuth verification service');
      }

      if (!tokenRes.ok) {
        throw new AuthenticationError('Invalid or expired Google OAuth token');
      }

      const payload = await tokenRes.json().catch(() => null);
      if (!payload || !payload.email) {
        throw new AuthenticationError('Google OAuth token did not return a valid email');
      }

      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      if (!emailVerified) {
        throw new AuthenticationError('Google account email is not verified');
      }

      if (payload.aud && config.GOOGLE_CLIENT_ID && payload.aud !== config.GOOGLE_CLIENT_ID) {
        throw new AuthenticationError('Google OAuth token audience mismatch');
      }

      verifiedEmail = String(payload.email).trim().toLowerCase();
      verifiedName = String(payload.name || '').trim();
      verifiedAvatar = String(payload.picture || '').trim();
      verifiedProviderId = String(payload.sub || '').trim();
    } else if (cleanProvider === 'facebook') {
      let fbRes;
      try {
        fbRes = await fetch(
          `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`
        );
      } catch {
        throw new AuthenticationError('Failed to contact Facebook OAuth verification service');
      }

      if (!fbRes.ok) {
        throw new AuthenticationError('Invalid or expired Facebook OAuth token');
      }

      const payload = await fbRes.json().catch(() => null);
      if (!payload || !payload.email || !payload.id) {
        throw new AuthenticationError('Facebook OAuth token did not return a verified email and id');
      }

      verifiedEmail = String(payload.email).trim().toLowerCase();
      verifiedName = String(payload.name || '').trim();
      verifiedAvatar = String(payload.picture?.data?.url || '').trim();
      verifiedProviderId = String(payload.id).trim();
    }

    if (!verifiedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail)) {
      throw new ValidationError('Valid verified email address is required from social provider', 'email');
    }

    // 1. Look up existing user by provider and providerId
    let user = verifiedProviderId ? await this.userRepo.findByProvider(cleanProvider, verifiedProviderId) : null;

    // 2. Look up user by verified email ONLY (never by derived username)
    if (!user && verifiedEmail) {
      user = await this.userRepo.findByEmail(verifiedEmail);
    }

    if (user) {
      // Prevent OAuth account pre-hijacking / overwriting password-based local accounts
      if ((user.authProvider || 'local') !== cleanProvider) {
        throw new ValidationError(
          'An account with this email already exists using a different sign-in method. Please sign in with your password.',
          'email'
        );
      }

      user.authProvider = cleanProvider;
      user.providerId = verifiedProviderId || user.providerId;
      if (!user.email && verifiedEmail) user.email = verifiedEmail;
      if ((!user.avatar || user.avatar === '👤') && verifiedAvatar) {
        user.avatar = verifiedAvatar;
      }
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

    // 3. New user: generate a clean unique username without collision with reserved usernames
    const rawHandle = verifiedEmail
      .split('@')[0]
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20);
    const baseHandle = rawHandle.length >= 3 ? rawHandle : `${cleanProvider}_user`;
    const uniqueUsername = await this.#generateUniqueSocialUsername(baseHandle);

    const dummyPasswordHash = User.hashPassword(crypto.randomBytes(32).toString('hex'));
    const newUser = new User({
      username: uniqueUsername,
      email: verifiedEmail,
      passwordHash: dummyPasswordHash,
      displayName: (verifiedName || uniqueUsername).slice(0, 50),
      avatar: verifiedAvatar || '✨',
      role: 'user',
      authProvider: cleanProvider,
      providerId: verifiedProviderId || null
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

  async #generateUniqueSocialUsername(baseHandle) {
    let candidate = baseHandle.toLowerCase();
    if (RESERVED_USERNAMES.has(candidate)) {
      candidate = `${candidate}_user`;
    }
    let attempt = 0;
    while (attempt < 20) {
      const existing = await this.userRepo.findByUsername(candidate);
      if (!existing && !RESERVED_USERNAMES.has(candidate)) return candidate;
      attempt++;
      const suffix = crypto.randomBytes(2).toString('hex');
      candidate = `${baseHandle.slice(0, 18).toLowerCase()}_${suffix}`;
    }
    return `pilot_${crypto.randomBytes(4).toString('hex')}`;
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
      return {
        success: true,
        message: 'A 6-digit verification code has been sent to your email address if an account exists.',
        email: AuthService.maskEmail(cleanEmail)
      };
    }

    const targetEmail = user.email || cleanEmail;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      throw new ValidationError('This account does not have a valid email configured to receive verification codes');
    }

    // Invalidate previous active codes for this email and reset failed attempt counter
    await this.passwordResetRepo.invalidateByEmail(targetEmail);
    this.failedResetAttempts.delete(targetEmail);

    // Generate cryptographically secure 6-digit OTP
    const code = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const id = `reset_${crypto.randomUUID()}`;

    await this.passwordResetRepo.createReset({
      id,
      email: targetEmail,
      code,
      expiresAt
    });

    const emailResult = await emailService.sendPasswordResetOtp({
      email: targetEmail,
      code,
      baseUrl
    });

    const response = {
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
      email: AuthService.maskEmail(targetEmail)
    };

    if (config.IS_TEST && emailResult.previewCode) {
      response.previewCode = emailResult.previewCode;
    }

    return response;
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

    const row = await this.passwordResetRepo.findActiveByEmailAndCode(cleanEmail, cleanCode);

    if (!row) {
      const attempts = (this.failedResetAttempts.get(cleanEmail) || 0) + 1;
      this.failedResetAttempts.set(cleanEmail, attempts);
      if (attempts >= 5) {
        try {
          await this.passwordResetRepo.invalidateByEmail(cleanEmail);
        } catch {}
        this.failedResetAttempts.delete(cleanEmail);
        throw new ValidationError('Too many failed verification attempts. Verification code has been invalidated for security. Please request a new code.');
      }
      throw new ValidationError('Invalid or previously used verification code');
    }

    if (Date.now() > new Date(row.expires_at).getTime()) {
      throw new ValidationError('Verification code has expired');
    }

    this.failedResetAttempts.delete(cleanEmail);
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

    await this.passwordResetRepo.markUsedByEmailAndCode(cleanEmail, String(code).trim());

    return {
      success: true,
      message: 'Password changed successfully. You can now sign in.'
    };
  }

  static #detectRasterMagicBytes(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { ext: 'png', mimeType: 'image/png' };
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return { ext: 'jpg', mimeType: 'image/jpeg' };
    }
    // GIF: GIF87a or GIF89a
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38 &&
      (buffer[4] === 0x37 || buffer[4] === 0x39) &&
      buffer[5] === 0x61
    ) {
      return { ext: 'gif', mimeType: 'image/gif' };
    }
    // WEBP: RIFF....WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { ext: 'webp', mimeType: 'image/webp' };
    }
    return null;
  }

  /**
   * Save uploaded base64 data URL avatar image to static storage
   * Strictly enforces raster image formats (PNG, JPEG, WEBP, GIF) and validates magic bytes.
   * @param {string} dataUrl
   * @returns {{ url: string, filename: string, size: number }}
   */
  async saveBase64Avatar(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new ValidationError('Valid base64 image data is required', 'image');
    }

    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      throw new ValidationError('Only PNG, JPEG, WEBP, and GIF raster images are allowed', 'image');
    }

    const base64Data = match[2].replace(/\s+/g, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      throw new ValidationError('Avatar image size must be under 5MB', 'image');
    }

    const detected = AuthService.#detectRasterMagicBytes(buffer);
    if (!detected) {
      throw new ValidationError('Invalid or corrupted image file signature', 'image');
    }

    const { ext, mimeType } = detected;
    const filename = `avatar_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const publicUrl = `/assets/avatars/${filename}`;

    const avatarsDir = path.resolve('frontend', 'assets', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      try {
        fs.mkdirSync(avatarsDir, { recursive: true });
      } catch {}
    }
    try {
      fs.writeFileSync(path.join(avatarsDir, filename), buffer);
    } catch (fsErr) {
      console.warn('[AuthService] Local filesystem cache write notice:', fsErr.message);
    }

    // Persist to relational SQL database (Turso libSQL / SQLite) for cloud durability
    try {
      await this.mediaAssetRepo.saveAsset({
        id: `asset_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        filename,
        mimeType,
        dataBase64: base64Data,
        size: buffer.length
      });
    } catch (dbErr) {
      console.warn('[AuthService] Could not persist media asset to SQL DB:', dbErr.message);
    }

    return {
      url: publicUrl,
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
      const user = await this.userRepo.findById(payload.sub);
      if (!user) return null;
      if (user.passwordHash) {
        const expectedPwd = crypto.createHash('sha256').update(user.passwordHash).digest('hex').slice(0, 12);
        if (!payload.pwd || payload.pwd !== expectedPwd) {
          return null;
        }
      }
      return user;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();

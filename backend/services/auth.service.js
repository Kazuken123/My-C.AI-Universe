import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { UserPersona } from '../models/UserPersona.js';
import { userRepository, personaRepository } from '../repositories/index.js';
import { AuthenticationError, ConflictError, ValidationError } from '../ai/errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cai-universe-secret-jwt-key-autumn-2026';
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
   * @returns {{ user: Object, token: string }}
   */
  register({ username, password, displayName, avatar = '👤' }) {
    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const existing = this.userRepo.findByUsername(cleanUsername);
    if (existing) {
      throw new ConflictError(`Username "${cleanUsername}" is already taken`);
    }

    const passwordHash = User.hashPassword(password);
    const user = new User({
      username: cleanUsername,
      passwordHash,
      displayName: displayName || cleanUsername,
      avatar
    });

    const savedUser = this.userRepo.create(user);

    // Give the new user a fresh personal starter persona
    const starterPersona = new UserPersona({
      userId: savedUser.id,
      name: savedUser.displayName || 'Adventurer',
      avatar: '🌟',
      description: `Default roleplay identity for @${savedUser.username}. Customize or create more in Personas!`,
      isDefault: true
    });
    this.personaRepo.save(starterPersona, savedUser.id);

    const token = this.generateToken(savedUser);
    return {
      user: savedUser.toJSON(),
      token
    };
  }

  /**
   * Log in an existing user and return session token
   * @param {Object} param0
   * @returns {{ user: Object, token: string }}
   */
  login({ username, password }) {
    if (!username || !password) {
      throw new ValidationError('Username and password are required');
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const user = this.userRepo.findByUsername(cleanUsername);
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
   * Retrieve active user entity from a Bearer token
   * @param {string} token
   * @returns {User|null}
   */
  getUserFromToken(token) {
    try {
      const payload = this.verifyToken(token);
      return this.userRepo.findById(payload.sub);
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();

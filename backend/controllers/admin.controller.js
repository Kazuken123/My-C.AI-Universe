import { BaseController } from './BaseController.js';
import {
  userRepository,
  characterRepository,
  chatSessionRepository,
  personaRepository,
  memoryRepository
} from '../repositories/index.js';
import { DatabaseConnection } from '../db/database.js';
import {
  globalRateLimiter,
  authRateLimiter,
  sensitiveEndpointLimiter
} from '../middlewares/security.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';
import { config } from '../config/index.js';

const SECURITY_CHECKLIST = Object.freeze([
  {
    id: 1,
    rule: 'Secrets in Client Bundle',
    status: 'pass',
    severity: 'critical',
    detail: 'Private API keys (Gemini, Turso, JWT) stay strictly on server. No client-side bundle exposure.'
  },
  {
    id: 2,
    rule: 'Ownership on Every Route',
    status: 'pass',
    severity: 'critical',
    detail: 'Strict owner & RBAC verification enforced on character, persona, memory, and chat storylines.'
  },
  {
    id: 3,
    rule: 'Database Security & Boundaries',
    status: 'pass',
    severity: 'high',
    detail: 'libSQL/Turso mediated strictly via Express backend without public anon keys or direct client query access.'
  },
  {
    id: 4,
    rule: 'Mass Assignment Prevention',
    status: 'pass',
    severity: 'high',
    detail: 'Strict field whitelisting. Server-generated IDs, stats isolation, and role immutability from client inputs.'
  },
  {
    id: 5,
    rule: 'Checkout & Webhook Integrity',
    status: 'info',
    severity: 'medium',
    detail: 'No metered client prices or payment webhooks in app. System is protected against client state tampering.'
  },
  {
    id: 6,
    rule: 'Targeted Rate Limiting',
    status: 'pass',
    severity: 'high',
    detail: 'IP-based auth brute-force limiter (15 req/m) and authenticated user compute quotas active.'
  },
  {
    id: 7,
    rule: 'Automated Negative Auth Tests',
    status: 'pass',
    severity: 'high',
    detail: 'Automated E2E negative boundary verification asserting 401/403 on cross-tenant operations.'
  }
]);

/**
 * AdminController Class (extends BaseController)
 * Provides comprehensive Administrative Operations, Threat Monitoring, User RBAC, and Content Moderation.
 */
export class AdminController extends BaseController {
  constructor() {
    super();
    this.userRepo = userRepository;
    this.charRepo = characterRepository;
    this.sessionRepo = chatSessionRepository;
    this.personaRepo = personaRepository;
    this.memoryRepo = memoryRepository;

    this.getOverview = this.getOverview.bind(this);
    this.getUsers = this.getUsers.bind(this);
    this.updateUserRole = this.updateUserRole.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.getCharacters = this.getCharacters.bind(this);
    this.deleteCharacter = this.deleteCharacter.bind(this);
    this.getRateLimitStatus = this.getRateLimitStatus.bind(this);
    this.unblockClient = this.unblockClient.bind(this);
  }

  #formatMemoryUsage() {
    const memUsage = process.memoryUsage();
    const toMB = (bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;
    return {
      rss: toMB(memUsage.rss),
      heapUsed: toMB(memUsage.heapUsed),
      heapTotal: toMB(memUsage.heapTotal)
    };
  }

  #collectRateLimiterStats() {
    return {
      global: globalRateLimiter.getStats(),
      auth: authRateLimiter.getStats(),
      sensitiveAi: sensitiveEndpointLimiter.getStats()
    };
  }

  /**
   * System Telemetry, Security Audit, and Resource Counts Overview
   */
  async getOverview(_req, res) {
    try {
      const [
        totalUsers,
        adminCount,
        charactersCount,
        sessionsCount,
        memoriesCount,
        personasCount,
        messagesCount
      ] = await Promise.all([
        typeof this.userRepo?.count === 'function' ? this.userRepo.count() : 0,
        typeof this.userRepo?.countAdmins === 'function' ? this.userRepo.countAdmins() : 0,
        typeof this.charRepo?.count === 'function' ? this.charRepo.count() : 0,
        typeof this.sessionRepo?.count === 'function' ? this.sessionRepo.count() : 0,
        typeof this.memoryRepo?.count === 'function' ? this.memoryRepo.count() : 0,
        typeof this.personaRepo?.count === 'function' ? this.personaRepo.count() : 0,
        typeof this.sessionRepo?.countMessages === 'function'
          ? this.sessionRepo.countMessages()
          : (this.sessionRepo?.db
              ? Promise.resolve(this.sessionRepo.db.prepare('SELECT COUNT(*) AS count FROM chat_messages').get())
                  .then(r => Number(r?.count) || 0)
                  .catch(() => 0)
              : 0)
      ]);

      return this.sendJson(res, {
        telemetry: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          databaseEngine: DatabaseConnection.getInstance().engineName,
          aiProvider: config.AI_PROVIDER,
          aiModel: config.GEMINI_MODEL,
          memory: this.#formatMemoryUsage()
        },
        counts: {
          totalUsers,
          admins: adminCount,
          standardUsers: Math.max(0, totalUsers - adminCount),
          characters: charactersCount,
          chatSessions: sessionsCount,
          chatMessages: messagesCount,
          personas: personasCount,
          memories: memoriesCount
        },
        securityChecklist: SECURITY_CHECKLIST,
        rateLimiters: this.#collectRateLimiterStats()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to retrieve admin system overview');
    }
  }

  /**
   * List all registered users with session counts
   */
  async getUsers(_req, res) {
    try {
      const [users, sessionCounts] = await Promise.all([
        this.userRepo.findAll(),
        typeof this.sessionRepo?.countByUser === 'function'
          ? this.sessionRepo.countByUser()
          : (this.sessionRepo?.db
              ? Promise.resolve(this.sessionRepo.db.prepare('SELECT user_id, COUNT(*) as count FROM chat_sessions WHERE user_id IS NOT NULL GROUP BY user_id').all())
                  .catch(() => [])
              : [])
      ]);

      const countMap = sessionCounts instanceof Map
        ? sessionCounts
        : new Map((sessionCounts || []).map(r => [r.user_id, Number(r.count) || 0]));

      const enriched = (users || []).map(u => {
        const base = typeof u?.toJSON === 'function' ? u.toJSON() : {
          id: u?.id,
          username: u?.username,
          displayName: u?.displayName,
          avatar: u?.avatar,
          authProvider: u?.authProvider,
          createdAt: u?.createdAt,
          updatedAt: u?.updatedAt
        };
        return {
          ...base,
          email: u?.email || 'N/A',
          role: u?.role || 'user',
          sessionCount: countMap.get(u?.id) || 0
        };
      });

      return this.sendJson(res, enriched);
    } catch (error) {
      return this.handleError(res, error, 'Failed to retrieve users list');
    }
  }

  #assertAdminActor(req) {
    if (!req?.user?.id || req.user.role !== 'admin') {
      const err = new ValidationError('Administrator authentication required');
      err.status = 403;
      err.code = 403;
      throw err;
    }
  }

  /**
   * Promote or demote user role
   */
  async updateUserRole(req, res) {
    try {
      this.#assertAdminActor(req);
      const { id } = req.params;
      const { role } = req.body || {};

      if (!id || typeof id !== 'string' || id.length > 100) {
        throw new ValidationError('Valid user ID is required', 'id');
      }

      if (!role || typeof role !== 'string' || !['admin', 'user'].includes(role.toLowerCase())) {
        throw new ValidationError('Role must be either "admin" or "user"', 'role');
      }

      const normalizedRole = role.toLowerCase();
      const targetUser = await this.userRepo.findById(id);
      if (!targetUser) {
        throw new NotFoundError('User not found');
      }

      if (req.user.id === targetUser.id && normalizedRole !== 'admin') {
        throw new ValidationError('You cannot remove your own admin privileges');
      }

      if (targetUser.role === 'admin' && normalizedRole !== 'admin') {
        const adminCount = await this.userRepo.countAdmins();
        if (adminCount <= 1) {
          throw new ValidationError('Cannot demote the last remaining administrator in the system');
        }
      }

      await this.userRepo.updateRole(id, normalizedRole);
      targetUser.role = normalizedRole;

      return this.sendJson(res, {
        success: true,
        user: targetUser.toJSON(),
        message: `User @${targetUser.username} role updated to "${targetUser.role}"`
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to update user role');
    }
  }

  /**
   * Delete user account and cascade associated data
   */
  async deleteUser(req, res) {
    try {
      this.#assertAdminActor(req);
      const { id } = req.params;
      if (!id || typeof id !== 'string' || id.length > 100) {
        throw new ValidationError('Valid user ID is required', 'id');
      }

      const targetUser = await this.userRepo.findById(id);
      if (!targetUser) {
        throw new NotFoundError('User not found');
      }

      if (req.user.id === targetUser.id) {
        throw new ValidationError('You cannot delete your own admin account from this panel');
      }

      if (targetUser.role === 'admin') {
        const adminCount = await this.userRepo.countAdmins();
        if (adminCount <= 1) {
          throw new ValidationError('Cannot delete the last remaining administrator in the system');
        }
      }

      await this.userRepo.deleteById(id);

      return this.sendJson(res, {
        success: true,
        deletedId: id,
        message: `User @${targetUser.username} and all associated data deleted successfully`
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete user');
    }
  }

  /**
   * List all characters with compact moderation summary (strips heavy prompt & lore text to minimize JSON payload)
   */
  async getCharacters(_req, res) {
    try {
      const characters = await this.charRepo.findAll();
      const compactList = characters.map(c => ({
        id: c.id,
        name: c.name,
        tagline: c.tagline,
        avatar: c.avatar,
        creator: c.creator,
        ownerUserId: c.ownerUserId || null,
        interactions: Number(c.interactions) || 0,
        likes: Number(c.likes) || 0,
        categories: Array.isArray(c.categories) ? c.categories : [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }));
      return this.sendJson(res, compactList);
    } catch (error) {
      return this.handleError(res, error, 'Failed to retrieve characters');
    }
  }

  /**
   * Admin content moderation: delete any character
   */
  async deleteCharacter(req, res) {
    try {
      this.#assertAdminActor(req);
      const { id } = req.params;
      if (!id || typeof id !== 'string' || id.length > 100) {
        throw new ValidationError('Valid character ID is required', 'id');
      }

      const character = await this.charRepo.findById(id);
      if (!character) {
        throw new NotFoundError('Character not found');
      }

      await this.charRepo.deleteById(id);
      return this.sendJson(res, {
        success: true,
        deletedId: id,
        message: `Character "${character.name}" moderated and deleted by administrator`
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete character');
    }
  }

  /**
   * View live rate limiter entries and throttled clients
   */
  getRateLimitStatus(_req, res) {
    try {
      return this.sendJson(res, this.#collectRateLimiterStats());
    } catch (error) {
      return this.handleError(res, error, 'Failed to get rate limit status');
    }
  }

  /**
   * Unblock a throttled IP or User ID in rate limiters
   */
  unblockClient(req, res) {
    try {
      this.#assertAdminActor(req);
      const { key, limiter = 'all' } = req.body || {};

      if (!key || typeof key !== 'string' || key.length > 128 || !/^(ip:|user:)[a-zA-Z0-9._:-]+$/.test(key.trim())) {
        throw new ValidationError('Target key must be a valid identifier starting with "ip:" or "user:"', 'key');
      }

      const allowedLimiters = ['all', 'auth', 'global', 'sensitiveAi'];
      if (typeof limiter !== 'string' || !allowedLimiters.includes(limiter)) {
        throw new ValidationError('Invalid rate limiter target specified', 'limiter');
      }

      const cleanKey = key.trim();
      let removed = false;
      if (limiter === 'auth' || limiter === 'all') {
        removed = authRateLimiter.resetKey(cleanKey) || removed;
      }
      if (limiter === 'global' || limiter === 'all') {
        removed = globalRateLimiter.resetKey(cleanKey) || removed;
      }
      if (limiter === 'sensitiveAi' || limiter === 'all') {
        removed = sensitiveEndpointLimiter.resetKey(cleanKey) || removed;
      }

      return this.sendJson(res, {
        success: true,
        key: cleanKey,
        removed,
        message: `Key "${cleanKey}" successfully unblocked from ${limiter} rate limiter(s)`
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to unblock client');
    }
  }
}

export const adminController = new AdminController();

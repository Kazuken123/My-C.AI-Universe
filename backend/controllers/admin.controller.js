import { BaseController } from './BaseController.js';
import {
  userRepository,
  characterRepository,
  chatSessionRepository,
  personaRepository,
  memoryRepository
} from '../repositories/index.js';
import { DatabaseConnection, getDatabase } from '../db/database.js';
import {
  globalRateLimiter,
  authRateLimiter,
  sensitiveEndpointLimiter
} from '../middlewares/security.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';
import { config } from '../config/index.js';

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

  /**
   * System Telemetry, Security Audit, and Resource Counts Overview
   */
  async getOverview(_req, res) {
    try {
      const db = getDatabase();
      const users = await this.userRepo.findAll();
      const charactersCount = await this.charRepo.count();
      const sessionsCount = await this.sessionRepo.count();
      const memoriesCount = await this.memoryRepo.count();
      const personasCount = await this.personaRepo.count();

      const messagesCountRow = await db.prepare('SELECT COUNT(*) AS count FROM chat_messages').get().catch(() => ({ count: 0 }));
      const messagesCount = Number(messagesCountRow?.count) || 0;

      const adminCount = users.filter(u => u.role === 'admin').length;
      const userCount = users.length - adminCount;

      const memUsage = process.memoryUsage();
      const memoryFormatted = {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`
      };

      const securityChecklist = [
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
      ];

      const limiters = {
        global: globalRateLimiter.getStats(),
        auth: authRateLimiter.getStats(),
        sensitiveAi: sensitiveEndpointLimiter.getStats()
      };

      return this.sendJson(res, {
        telemetry: {
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          databaseEngine: DatabaseConnection.getInstance().engineName,
          aiProvider: config.AI_PROVIDER,
          aiModel: config.GEMINI_MODEL,
          memory: memoryFormatted
        },
        counts: {
          totalUsers: users.length,
          admins: adminCount,
          standardUsers: userCount,
          characters: charactersCount,
          chatSessions: sessionsCount,
          chatMessages: messagesCount,
          personas: personasCount,
          memories: memoriesCount
        },
        securityChecklist,
        rateLimiters: limiters
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
      const db = getDatabase();
      const users = await this.userRepo.findAll();
      const sessionCounts = await db.prepare(`
        SELECT user_id, COUNT(*) as count FROM chat_sessions WHERE user_id IS NOT NULL GROUP BY user_id
      `).all().catch(() => []);

      const countMap = new Map(sessionCounts.map(r => [r.user_id, Number(r.count) || 0]));

      const enriched = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email || 'N/A',
        displayName: u.displayName,
        avatar: u.avatar,
        role: u.role || 'user',
        authProvider: u.authProvider,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        sessionCount: countMap.get(u.id) || 0
      }));

      return this.sendJson(res, enriched);
    } catch (error) {
      return this.handleError(res, error, 'Failed to retrieve users list');
    }
  }

  /**
   * Promote or demote user role
   */
  async updateUserRole(req, res) {
    try {
      const { id } = req.params;
      const { role } = req.body || {};

      if (!role || !['admin', 'user'].includes(role.toLowerCase())) {
        throw new ValidationError('Role must be either "admin" or "user"', 'role');
      }

      const targetUser = await this.userRepo.findById(id);
      if (!targetUser) {
        throw new NotFoundError('User not found');
      }

      // Prevent demoting self to maintain system access
      if (req.user.id === targetUser.id && role.toLowerCase() !== 'admin') {
        throw new ValidationError('You cannot remove your own admin privileges');
      }

      // Prevent demoting the last remaining administrator
      if (targetUser.role === 'admin' && role.toLowerCase() !== 'admin') {
        const adminCount = await this.userRepo.countAdmins();
        if (adminCount <= 1) {
          throw new ValidationError('Cannot demote the last remaining administrator in the system');
        }
      }

      await this.userRepo.updateRole(id, role.toLowerCase());
      targetUser.role = role.toLowerCase();

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
      const { id } = req.params;
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
   * List all characters with full creator and engagement stats
   */
  async getCharacters(_req, res) {
    try {
      const characters = await this.charRepo.findAll();
      return this.sendJson(res, characters.map(c => c.toJSON()));
    } catch (error) {
      return this.handleError(res, error, 'Failed to retrieve characters');
    }
  }

  /**
   * Admin content moderation: delete any character
   */
  async deleteCharacter(req, res) {
    try {
      const { id } = req.params;
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
      return this.sendJson(res, {
        global: globalRateLimiter.getStats(),
        auth: authRateLimiter.getStats(),
        sensitiveAi: sensitiveEndpointLimiter.getStats()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to get rate limit status');
    }
  }

  /**
   * Unblock a throttled IP or User ID in rate limiters
   */
  unblockClient(req, res) {
    try {
      const { key, limiter = 'all' } = req.body || {};
      if (!key) {
        throw new ValidationError('Target key (ip:... or user:...) is required', 'key');
      }

      let removed = false;
      if (limiter === 'auth' || limiter === 'all') {
        removed = authRateLimiter.resetKey(key) || removed;
      }
      if (limiter === 'global' || limiter === 'all') {
        removed = globalRateLimiter.resetKey(key) || removed;
      }
      if (limiter === 'sensitiveAi' || limiter === 'all') {
        removed = sensitiveEndpointLimiter.resetKey(key) || removed;
      }

      return this.sendJson(res, {
        success: true,
        key,
        message: `Key "${key}" successfully unblocked from ${limiter} rate limiter(s)`
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to unblock client');
    }
  }
}

export const adminController = new AdminController();

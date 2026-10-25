import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { config, validateEnvironment } from './backend/config/index.js';
import apiRoutes from './backend/routes/index.js';
import { storage } from './backend/services/storage.service.js';
import { DatabaseConnection } from './backend/db/database.js';
import {
  securityHeadersMiddleware,
  globalRateLimiter,
  authRateLimiter,
  sensitiveEndpointLimiter
} from './backend/middlewares/security.js';
import { optionalAuth } from './backend/middlewares/auth.js';
import { mediaAssetRepository } from './backend/repositories/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ApplicationServer Class (OOP Bootstrap & HTTP Server Lifecycle Manager)
 */
export class ApplicationServer {
  constructor() {
    this.app = express();
    this.httpServer = null;
    this.dbConnection = DatabaseConnection.getInstance();
    this.#initializeProcessHooks();
    this.#initializeDatabase();
    this.#configureMiddleware();
    this.#configureRoutes();
    this.#configureErrorHandling();
  }

  #initializeProcessHooks() {
    process.on('uncaughtException', (err) => {
      console.error('UNCAUGHT EXCEPTION:', err.stack || err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('UNHANDLED PROMISE REJECTION:', reason);
    });
  }

  #initializeDatabase() {
    validateEnvironment();
    this.dbConnection.connect();
  }

  #configureMiddleware() {
    if (process.env.TRUST_PROXY) {
      const tpVal = process.env.TRUST_PROXY.trim();
      this.app.set('trust proxy', tpVal === 'true' || tpVal === '1' ? 1 : (!isNaN(Number(tpVal)) ? Number(tpVal) : tpVal));
    } else {
      this.app.set('trust proxy', false);
    }
    this.app.disable('x-powered-by');
    this.app.use(securityHeadersMiddleware());

    this.app.use(cors({
      origin: config.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
    }));

    // Attach optional auth to populate req.user before per-user rate limiters
    this.app.use('/api', optionalAuth);

    // Apply strict rate limiting to auth endpoints
    this.app.use([
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/auth/verify-code'
    ], authRateLimiter.middleware());

    // Apply global rate limiting to all /api routes
    this.app.use('/api', globalRateLimiter.middleware());
    this.app.use(['/api/chat', '/api/chats', '/api/character/generate', '/api/character/parse-wiki'], sensitiveEndpointLimiter.middleware());

    this.app.use(express.json({ limit: '7mb' }));
  }

  #configureRoutes() {
    this.app.get('/api/test', (_req, res) => {
      res.json({ message: 'My C.AI Universe OOP + SQL API is working!' });
    });

    this.app.get('/api/health', async (_req, res) => {
      const sqlStats = await storage.getSqlStats();
      const dbType = sqlStats.engine && sqlStats.engine.includes('Turso') ? 'turso' : 'sqlite';
      res.json({
        status: 'healthy',
        architecture: 'OOP (Models, Repositories, Services, Controllers, Providers)',
        timestamp: new Date().toISOString(),
        database: dbType,
        ai_provider: config.AI_PROVIDER,
        gemini_model: config.GEMINI_MODEL,
        gemini_available: !!process.env.GEMINI_API_KEY,
        stats: sqlStats.tables
      });
    });

    this.app.use('/api', apiRoutes);

    const frontendDir = path.join(__dirname, 'frontend');

    // Dynamic Database Fallback for Media Assets (/assets/avatars/:filename)
    // Ensures avatars persist even without committing images to Git or on ephemeral hosting
    const SAFE_AVATAR_FILENAME = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i;
    const ALLOWED_AVATAR_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

    this.app.get('/assets/avatars/:filename', async (req, res, next) => {
      const rawFilename = String(req.params.filename || '');
      if (!SAFE_AVATAR_FILENAME.test(rawFilename)) {
        return res.status(400).end();
      }

      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('X-Content-Type-Options', 'nosniff');

      const localFilePath = path.join(frontendDir, 'assets', 'avatars', rawFilename);
      if (fs.existsSync(localFilePath)) {
        return res.sendFile(localFilePath);
      }

      try {
        const asset = await mediaAssetRepository.findByFilename(rawFilename);
        if (asset && asset.data_base64) {
          const buffer = Buffer.from(asset.data_base64, 'base64');
          // Self-heal disk cache if folder is writable
          try {
            const avatarsDir = path.join(frontendDir, 'assets', 'avatars');
            if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
            fs.writeFileSync(localFilePath, buffer);
          } catch {}

          const safeMime = ALLOWED_AVATAR_MIMES.has(asset.mime_type) ? asset.mime_type : 'application/octet-stream';
          res.setHeader('Content-Type', safeMime);
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(buffer);
        }
      } catch (err) {
        console.warn('[Server] Media asset SQL fallback notice:', err.message);
      }
      return res.status(404).end();
    });

    // Admin Operations Center & Security Assets Gatekeeper
    // Strict server-side RBAC: prevents unauthenticated visitors and regular clients
    // from accessing admin.html, admin-page.js, or admin.css
    // Smoothly redirects any unauthorized client back to the website homepage (/)
    const requireAdminWebAccess = (req, res, next) => {
      optionalAuth(req, res, () => {
        if (!req.user || req.user.role !== 'admin') {
          // If browser is requesting HTML page (/admin or /admin.html), redirect directly home
          if (req.accepts('html') && !req.path.endsWith('.js') && !req.path.endsWith('.css')) {
            return res.redirect('/');
          }
          // If requesting JS/CSS assets or API, reject with 403 Forbidden
          return res.status(403).json({ error: { message: 'Forbidden: Admin access required', code: 403 } });
        }

        next();
      });
    };

    // Intercept any direct static requests to admin files before express.static can serve them
    // Normalize duplicate slashes, backslashes, and trailing Windows NTFS dots/spaces before gating admin assets
    this.app.use((req, res, next) => {
      const normalizedPath = path.posix
        .normalize(String(req.path || '/').replace(/\\/g, '/'))
        .replace(/\/+/g, '/')
        .replace(/[.\s]+$/, '');

      if (/^\/(admin(\.html)?|js\/admin-page\.js|css\/admin\.css)$/i.test(normalizedPath)) {
        return requireAdminWebAccess(req, res, next);
      }
      next();
    });

    this.app.get(['/admin', '/admin.html'], requireAdminWebAccess, (_req, res) => {
      res.sendFile(path.join(frontendDir, 'admin.html'));
    });

    // Ensure browsers always revalidate JS and CSS assets during live updates
    this.app.use((req, res, next) => {
      if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      }
      next();
    });

    this.app.use(express.static(frontendDir));

    this.app.get(['/', '/dashboard', '/index.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });

    this.app.get(['/chat', '/chat.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'chat.html'));
    });

    this.app.get(['/auth', '/auth.html', '/login', '/login.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'auth.html'));
    });

    this.app.get(['/profile-setup', '/profile-setup.html', '/setup'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'profile-setup.html'));
    });

    this.app.get(['/reset-password', '/reset-password.html', '/forgot-password'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'reset-password.html'));
    });

    this.app.get(['/create', '/create.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'create.html'));
    });

    this.app.get(['/chats', '/chats.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'chats.html'));
    });

    this.app.get(['/personas', '/personas.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'personas.html'));
    });

    this.app.get(['/characters', '/characters.html'], (_req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });

    this.app.get(['/admin', '/admin.html'], requireAdminWebAccess, (_req, res) => {
      res.sendFile(path.join(frontendDir, 'admin.html'));
    });
  }

  #configureErrorHandling() {
    this.app.use((_req, res) => {
      res.status(404).json({
        error: { message: 'Route not found', code: 404 }
      });
    });

    this.app.use((error, req, res, _next) => {
      console.error('Unhandled server error:', {
        message: error.message,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      const rawCode = error?.statusCode ?? error?.status ?? error?.code;
      const statusCode =
        typeof rawCode === 'number' && Number.isInteger(rawCode) && rawCode >= 400 && rawCode <= 599
          ? rawCode
          : 500;

      const safeMessage =
        statusCode >= 500
          ? 'Internal server error'
          : (error?.message || 'Internal server error');

      res.status(statusCode).json({
        error: {
          message: safeMessage,
          code: statusCode
        }
      });
    });
  }

  start(port = config.PORT) {
    this.httpServer = this.app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 My C.AI Universe (OOP + SQL) running at http://localhost:${port}`);
      console.log(`🗄️  Relational Database: ${this.dbConnection.engineName}`);
      console.log(`🤖 Primary AI Provider: ${config.AI_PROVIDER} (${config.GEMINI_MODEL})`);
    });
    return this.httpServer;
  }

  async stop() {
    if (this.httpServer) {
      await new Promise(resolve => this.httpServer.close(resolve));
      this.httpServer = null;
    }
    this.dbConnection.close();
  }
}

export const serverInstance = new ApplicationServer();
export const httpServer = serverInstance.start();
export default serverInstance.app;
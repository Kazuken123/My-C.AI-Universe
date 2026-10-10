import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateEnvironment } from './backend/config/index.js';
import apiRoutes from './backend/routes/index.js';
import { storage } from './backend/services/storage.service.js';
import { DatabaseConnection } from './backend/db/database.js';
import {
  securityHeadersMiddleware,
  globalRateLimiter,
  sensitiveEndpointLimiter
} from './backend/middlewares/security.js';

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
    this.app.disable('x-powered-by');
    this.app.use(securityHeadersMiddleware());

    this.app.use(cors({
      origin: config.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
    }));

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Apply global rate limiting to all /api routes
    this.app.use('/api', globalRateLimiter.middleware());
    this.app.use(['/api/chat', '/api/character/generate', '/api/character/parse-wiki'], sensitiveEndpointLimiter.middleware());
  }

  #configureRoutes() {
    this.app.get('/api/test', (_req, res) => {
      res.json({ message: 'My C.AI Universe OOP + SQL API is working!' });
    });

    this.app.get('/api/health', async (_req, res) => {
      const sqlStats = await storage.getSqlStats();
      res.json({
        status: 'healthy',
        architecture: 'OOP (Models, Repositories, Services, Controllers, Providers)',
        timestamp: new Date().toISOString(),
        database: sqlStats.engine,
        ai_provider: config.AI_PROVIDER,
        gemini_model: config.GEMINI_MODEL,
        gemini_available: !!process.env.GEMINI_API_KEY,
        stats: sqlStats.tables
      });
    });

    this.app.use('/api', apiRoutes);

    const frontendDir = path.join(__dirname, 'frontend');
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

      const statusCode = error.status || error.code || 500;
      res.status(statusCode).json({
        error: {
          message: error.message || 'Internal server error',
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
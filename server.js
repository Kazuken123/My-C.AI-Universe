import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateEnvironment } from './backend/config/index.js';
import apiRoutes from './backend/routes/index.js';
import { storage } from './backend/services/storage.service.js';
import { getDatabase } from './backend/db/database.js';

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.stack || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED PROMISE REJECTION:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

validateEnvironment();

// Initialize SQLite relational database & schema on startup
getDatabase();

const app = express();

// CORS middleware
app.use(cors({
  origin: config.CORS_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health and diagnostic endpoints
app.get('/api/test', (req, res) => {
  res.json({ message: 'My C.AI Universe SQL API is working!' });
});

app.get('/api/health', (req, res) => {
  const sqlStats = storage.getSqlStats();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: sqlStats.engine,
    ai_provider: config.AI_PROVIDER,
    gemini_model: config.GEMINI_MODEL,
    gemini_available: !!process.env.GEMINI_API_KEY,
    stats: sqlStats.tables
  });
});

// Mount all API routes under /api
app.use('/api', apiRoutes);

// Serve static frontend files
const FRONTEND_DIR = path.join(__dirname, 'frontend');
app.use(express.static(FRONTEND_DIR));

// SPA & legacy page routes all serve frontend/index.html
const spaRoutes = [
  '/',
  '/index.html',
  '/chat.html',
  '/create.html',
  '/characters.html',
  '/chats.html',
  '/chat',
  '/create',
  '/characters',
  '/chats',
  '/personas'
];

app.get(spaRoutes, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// 404 handler for unknown API or asset routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      code: 404
    }
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
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

export const httpServer = app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🚀 My C.AI Universe running at http://localhost:${config.PORT}`);
  console.log(`🗄️  Relational Database: SQLite (backend/db/universe.sqlite | schema.sql)`);
  console.log(`🤖 Primary AI Provider: ${config.AI_PROVIDER} (${config.GEMINI_MODEL})`);
});

export default app;
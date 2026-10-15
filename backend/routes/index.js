import express from 'express';
import characterRoutes from './character.route.js';
import chatRoutes from './chat.route.js';
import personaRoutes from './persona.route.js';
import memoryRoutes from './memory.route.js';
import authRoutes from './auth.route.js';
import adminRoutes from './admin.route.js';

const router = express.Router();

router.get('/system/ping', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.6.1',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

router.use(authRoutes);
router.use(adminRoutes);
router.use(characterRoutes);
router.use(chatRoutes);
router.use(personaRoutes);
router.use(memoryRoutes);

export default router;

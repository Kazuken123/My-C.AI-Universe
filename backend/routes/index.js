import express from 'express';
import characterRoutes from './character.route.js';
import chatRoutes from './chat.route.js';
import personaRoutes from './persona.route.js';
import memoryRoutes from './memory.route.js';
import authRoutes from './auth.route.js';

const router = express.Router();

router.use(authRoutes);
router.use(characterRoutes);
router.use(chatRoutes);
router.use(personaRoutes);
router.use(memoryRoutes);

export default router;

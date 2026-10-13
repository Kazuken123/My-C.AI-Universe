import express from 'express';
import {
  getMemories,
  addMemory,
  deleteMemory
} from '../controllers/memory.controller.js';

import { requireAuth, optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/memories', optionalAuth, getMemories);
router.post('/memories', requireAuth, addMemory);
router.delete('/memories/:id', requireAuth, deleteMemory);

export default router;

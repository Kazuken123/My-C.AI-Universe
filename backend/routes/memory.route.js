import express from 'express';
import {
  getMemories,
  addMemory,
  deleteMemory
} from '../controllers/memory.controller.js';

const router = express.Router();

router.get('/memories', getMemories);
router.post('/memories', addMemory);
router.delete('/memories/:id', deleteMemory);

export default router;

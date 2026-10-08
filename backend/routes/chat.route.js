import express from 'express';
import {
  sendChatMessage,
  getChatSessions,
  createChatSession,
  getChatSession,
  deleteChatSession,
  updateChatMessage,
  rewindChatSession
} from '../controllers/chat.controller.js';
import { optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

// Chat sessions management
router.get('/chats', optionalAuth, getChatSessions);
router.post('/chats', optionalAuth, createChatSession);
router.get('/chats/:sessionId', optionalAuth, getChatSession);
router.delete('/chats/:sessionId', optionalAuth, deleteChatSession);

// Message editing, variant selection, pinning, rating, and rewind
router.put('/chats/:sessionId/messages/:messageId', optionalAuth, updateChatMessage);
router.post('/chats/:sessionId/rewind', optionalAuth, rewindChatSession);

// Primary chat completion / regeneration / continuation endpoint
router.post('/chat', optionalAuth, sendChatMessage);

export default router;

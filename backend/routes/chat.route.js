import express from 'express';
import {
  sendChatMessage,
  getChatSessions,
  createChatSession,
  getChatSession,
  deleteChatSession,
  updateChatMessage,
  rewindChatSession,
  updateSessionRelationship,
  updateSessionVoice
} from '../controllers/chat.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

// Chat sessions management
router.get('/chats', requireAuth, getChatSessions);
router.post('/chats', requireAuth, createChatSession);
router.get('/chats/:sessionId', requireAuth, getChatSession);
router.delete('/chats/:sessionId', requireAuth, deleteChatSession);
router.put('/chats/:sessionId/relationship', requireAuth, updateSessionRelationship);
router.put('/chats/:sessionId/voice', requireAuth, updateSessionVoice);

// Message editing, variant selection, pinning, rating, and rewind
router.put('/chats/:sessionId/messages/:messageId', requireAuth, updateChatMessage);
router.post('/chats/:sessionId/rewind', requireAuth, rewindChatSession);

// Primary chat completion / regeneration / continuation endpoint
router.post('/chat', requireAuth, sendChatMessage);

export default router;

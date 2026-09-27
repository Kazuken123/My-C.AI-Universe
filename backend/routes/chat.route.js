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

const router = express.Router();

// Chat sessions management
router.get('/chats', getChatSessions);
router.post('/chats', createChatSession);
router.get('/chats/:sessionId', getChatSession);
router.delete('/chats/:sessionId', deleteChatSession);

// Message editing, variant selection, pinning, rating, and rewind
router.put('/chats/:sessionId/messages/:messageId', updateChatMessage);
router.post('/chats/:sessionId/rewind', rewindChatSession);

// Primary chat completion / regeneration / continuation endpoint
router.post('/chat', sendChatMessage);

export default router;

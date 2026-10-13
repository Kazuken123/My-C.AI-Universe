import express from 'express';
import {
  createCharacter,
  getCharacters,
  getCharacter,
  updateCharacter,
  deleteCharacter,
  toggleLikeCharacter,
  parseWikiPreview,
  generateCharacterAI
} from '../controllers/character.controller.js';

import { optionalAuth, requireAuth } from '../middlewares/auth.js';

const router = express.Router();

// Wiki preview & AI generation endpoints
router.post('/character/parse-wiki', parseWikiPreview);
router.post('/character/generate', generateCharacterAI);

// Character CRUD endpoints (supporting both /character and /characters conventions)
router.post('/character', optionalAuth, createCharacter);
router.post('/characters', optionalAuth, createCharacter);
router.get('/characters', getCharacters);
router.get('/character/:id', getCharacter);
router.get('/characters/:id', getCharacter);
router.put('/character/:id', requireAuth, updateCharacter);
router.put('/characters/:id', requireAuth, updateCharacter);
router.delete('/character/:id', requireAuth, deleteCharacter);
router.delete('/characters/:id', requireAuth, deleteCharacter);
router.post('/character/:id/like', toggleLikeCharacter);

export default router;

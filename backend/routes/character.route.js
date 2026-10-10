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

import { optionalAuth } from '../middlewares/auth.js';

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
router.put('/character/:id', optionalAuth, updateCharacter);
router.put('/characters/:id', optionalAuth, updateCharacter);
router.delete('/character/:id', optionalAuth, deleteCharacter);
router.delete('/characters/:id', optionalAuth, deleteCharacter);
router.post('/character/:id/like', toggleLikeCharacter);

export default router;

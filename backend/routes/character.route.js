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

const router = express.Router();

// Wiki preview & AI generation endpoints
router.post('/character/parse-wiki', parseWikiPreview);
router.post('/character/generate', generateCharacterAI);

// Character CRUD endpoints (supporting both /character and /characters conventions)
router.post('/character', createCharacter);
router.post('/characters', createCharacter);
router.get('/characters', getCharacters);
router.get('/character/:id', getCharacter);
router.get('/characters/:id', getCharacter);
router.put('/character/:id', updateCharacter);
router.put('/characters/:id', updateCharacter);
router.delete('/character/:id', deleteCharacter);
router.delete('/characters/:id', deleteCharacter);
router.post('/character/:id/like', toggleLikeCharacter);

export default router;

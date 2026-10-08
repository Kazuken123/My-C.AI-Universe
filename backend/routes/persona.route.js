import express from 'express';
import {
  getPersonas,
  createPersona,
  updatePersona,
  deletePersona
} from '../controllers/persona.controller.js';
import { optionalAuth } from '../middlewares/auth.js';

const router = express.Router();

router.get('/personas', optionalAuth, getPersonas);
router.post('/personas', optionalAuth, createPersona);
router.put('/personas/:id', optionalAuth, updatePersona);
router.delete('/personas/:id', optionalAuth, deletePersona);

export default router;

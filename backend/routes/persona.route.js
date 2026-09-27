import express from 'express';
import {
  getPersonas,
  createPersona,
  updatePersona,
  deletePersona
} from '../controllers/persona.controller.js';

const router = express.Router();

router.get('/personas', getPersonas);
router.post('/personas', createPersona);
router.put('/personas/:id', updatePersona);
router.delete('/personas/:id', deletePersona);

export default router;

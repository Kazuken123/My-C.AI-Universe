import express from 'express';
import {
  searchModels,
  createCustomVoice,
  synthesizeVoice
} from '../controllers/voice.controller.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import {
  sensitiveEndpointLimiter,
  voiceSynthesizeLimiter,
  voiceUploadLimiter
} from '../middlewares/security.js';

const router = express.Router();

// Search community models (authenticated to prevent public scraping)
router.get('/voice/models', requireAuth, sensitiveEndpointLimiter.middleware(), searchModels);

// Create custom voice model (admin-only to guard the 3-slot free account ceiling)
router.post('/voice/custom', requireAuth, requireAdmin, voiceUploadLimiter.middleware(), createCustomVoice);

// Synthesize character voice audio
router.post('/voice/synthesize', requireAuth, voiceSynthesizeLimiter.middleware(), synthesizeVoice);

export default router;

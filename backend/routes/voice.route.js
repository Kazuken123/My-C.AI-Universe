import express from 'express';
import {
  searchModels,
  createCustomVoice,
  synthesizeVoice
} from '../controllers/voice.controller.js';
import { optionalAuth, requireAuth, requireAdmin } from '../middlewares/auth.js';
import {
  sensitiveEndpointLimiter,
  voiceSynthesizeLimiter,
  voiceUploadLimiter
} from '../middlewares/security.js';

const router = express.Router();

// Search community models (rate-limited, works for both authenticated and guest sessions)
router.get('/voice/models', optionalAuth, sensitiveEndpointLimiter.middleware(), searchModels);

// Create custom voice model (admin-only to guard the 3-slot free account ceiling)
router.post('/voice/custom', requireAuth, requireAdmin, voiceUploadLimiter.middleware(), createCustomVoice);
router.post('/voice/models/custom', requireAuth, requireAdmin, voiceUploadLimiter.middleware(), createCustomVoice);

// Synthesize character voice audio
router.post('/voice/synthesize', requireAuth, voiceSynthesizeLimiter.middleware(), synthesizeVoice);

export default router;

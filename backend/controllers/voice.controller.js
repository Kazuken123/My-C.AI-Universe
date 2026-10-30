import { BaseController } from './BaseController.js';
import { voiceService } from '../services/voice.service.js';

/**
 * VoiceController Class (extends BaseController)
 * Handles voice model searches, custom voice audio registration, and authenticated message TTS synthesis.
 */
export class VoiceController extends BaseController {
  constructor(service = voiceService) {
    super();
    this.service = service;
    this.searchModels = this.searchModels.bind(this);
    this.createCustomVoice = this.createCustomVoice.bind(this);
    this.synthesizeVoice = this.synthesizeVoice.bind(this);
  }

  /**
   * Search community voice models on Fish Audio
   * GET /api/voice/models?search=...&page=1&pageSize=15
   */
  async searchModels(req, res) {
    try {
      const { search = '', page = 1, pageSize = 15 } = req.query;
      const results = await this.service.searchVoices({
        query: String(search),
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 15
      });
      return this.sendJson(res, { success: true, ...results });
    } catch (error) {
      return this.handleError(res, error, 'Failed to search voice models');
    }
  }

  /**
   * Upload sample audio to register a custom private voice model
   * POST /api/voice/custom
   */
  async createCustomVoice(req, res) {
    try {
      const { title, description, audioDataUrl } = req.body || {};
      const result = await this.service.createCustomVoice({
        title,
        description,
        audioDataUrl
      });
      return this.sendJson(res, { success: true, voice: result }, 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create custom voice model');
    }
  }

  /**
   * Synthesize character voice audio for a specific message
   * POST /api/voice/synthesize
   * Body: { sessionId, messageId, variantIndex }
   */
  async synthesizeVoice(req, res) {
    try {
      const userId = req.user?.id || null;
      const { sessionId, messageId, variantIndex } = req.body || {};

      const result = await this.service.synthesizeMessageVoice({
        userId,
        sessionId,
        messageId,
        variantIndex: variantIndex !== undefined ? Number(variantIndex) : null
      });

      res.setHeader('Content-Type', result.mimeType || 'audio/mpeg');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Voice-Cache-Hit', result.cacheHit ? '1' : '0');
      return res.status(200).send(result.audioBuffer);
    } catch (error) {
      return this.handleError(res, error, 'Voice synthesis failed');
    }
  }
}

export const voiceController = new VoiceController();
export const {
  searchModels,
  createCustomVoice,
  synthesizeVoice
} = voiceController;

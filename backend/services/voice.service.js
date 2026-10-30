import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/index.js';
import { r2StorageService } from './r2.service.js';
import { characterRepository, chatSessionRepository } from '../repositories/index.js';
import { SAFE_VOICE_ID_REGEX } from '../models/Character.js';
import { ValidationError, NotFoundError, AIError } from '../ai/errors.js';
import { PERMISSIVE_SAFETY_SETTINGS, sanitizePromptForGemini } from '../ai/providers/gemini.js';

export const ALLOWED_EMOTION_TAGS = new Set([
  'pout',
  'sigh',
  'gasp',
  'chuckle',
  'laughs',
  'laugh',
  'whisper',
  'sob',
  'angry',
  'shy',
  'blush',
  'crying',
  'yawn',
  'pant',
  'giggle'
]);

/**
 * VoiceService Class
 * Encapsulates Fish Audio community model discovery, zero-shot/custom voice creation,
 * quota-isolated Gemini 3.1 Flash Lite Japanese emotion translation, and Cloudflare R2 audio caching.
 */
export class VoiceService {
  constructor(
    r2 = r2StorageService,
    sessionRepo = chatSessionRepository,
    charRepo = characterRepository
  ) {
    this.r2 = r2;
    this.sessionRepo = sessionRepo;
    this.charRepo = charRepo;
  }

  /**
   * Extract clean spoken dialogue from raw character roleplay text
   * Strips internal system markers [REL_STATE:...], [Scene...], *actions*, speaker labels, and quotes.
   * @param {string} rawText
   * @returns {string}
   */
  static extractSpokenDialogue(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      throw new ValidationError('Message content is required for voice synthesis', 'text');
    }

    let cleaned = rawText
      // Strip internal relationship & directive tags
      .replace(/\[REL_STATE:[^\]]*\]/gi, '')
      .replace(/\[Scene[^\]]*\]/gi, '')
      .replace(/\[Directive[^\]]*\]/gi, '')
      // Strip markdown italic actions (*...* or _..._)
      .replace(/\*[^*]+\*/g, '')
      .replace(/_[^_]+_/g, '')
      // Strip speaker prefixes like "Kana: " or "Character Name:"
      .replace(/^[^:\n]{1,40}:\s*/gm, '')
      // Strip stray surrounding quotation marks
      .replace(/["“”«»]/g, '')
      .trim();

    // Collapse multiple whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (!cleaned) {
      throw new ValidationError('No spoken dialogue found in message (only actions/silent notes)', 'text');
    }

    // Cap at 500 characters to prevent buffer overruns and comply with Fish Audio free tier caps
    return cleaned.slice(0, 500).trim();
  }

  /**
   * Verify audio magic bytes for binary audio files
   * Supports WAV (RIFF/WAVE), MP3 (ID3 or MPEG frame sync), OGG (OggS), and WebM (1A 45 DF A3)
   * @param {Buffer} buffer
   * @returns {{ ext: string, mimeType: string } | null}
   */
  static detectAudioMagicBytes(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

    // WAV: RIFF....WAVE
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 && buffer[10] === 0x56 && buffer[11] === 0x45
    ) {
      return { ext: 'wav', mimeType: 'audio/wav' };
    }

    // MP3 with ID3v2 tag: ID3
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return { ext: 'mp3', mimeType: 'audio/mpeg' };
    }

    // Raw MP3 frame header (MPEG-1/2 Audio sync word 0xFF 0xE0)
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
      return { ext: 'mp3', mimeType: 'audio/mpeg' };
    }

    // OGG container: OggS
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return { ext: 'ogg', mimeType: 'audio/ogg' };
    }

    // WebM / EBML container: 1A 45 DF A3
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return { ext: 'webm', mimeType: 'audio/webm' };
    }

    return null;
  }

  /**
   * Sanitize external URL to strict https protocol (prevents javascript:/data: XSS)
   * @param {string} rawUrl
   * @returns {string|null}
   */
  static sanitizeHttpsUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      const trimmed = rawUrl.trim();
      if (/^(?:coverimage|avatars)\//i.test(trimmed)) {
        return `https://public-platform.r2.fish.audio/${trimmed}`;
      }
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Filter and normalize bracket emotion tags for Fish Audio
   * Preserves only allowlisted emotion tags e.g. [pout], [sigh], [chuckle]
   * @param {string} text
   * @returns {string}
   */
  static filterEmotionTags(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\[([a-zA-Z0-9_\-\s]+)\]/g, (match, tag) => {
      const normalized = String(tag || '').trim().toLowerCase();
      if (ALLOWED_EMOTION_TAGS.has(normalized)) {
        return `[${normalized}]`;
      }
      return ''; // Strip non-allowlisted bracket annotations
    }).replace(/\s+/g, ' ').trim();
  }

  /**
   * Search Fish Audio community voice models
   * @param {Object} params
   * @param {string} params.query
   * @param {number} [params.page=1]
   * @param {number} [params.pageSize=15]
   * @returns {Promise<{ total: number, items: Array, unconfigured?: boolean }>}
   */
  async searchVoices({ query = '', page = 1, pageSize = 15 } = {}) {
    if (!(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)) {
      return { total: 0, items: [], unconfigured: true };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(24, Math.max(1, Number(pageSize) || 15));
    const cleanQuery = (query || '').trim();

    const url = new URL(`${config.FISH_AUDIO_BASE_URL}/model`);
    if (cleanQuery) url.searchParams.set('title', cleanQuery);
    url.searchParams.set('page_size', String(safePageSize));
    url.searchParams.set('page_number', String(safePage));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn('[VoiceService] Fish Audio search returned status', response.status, errorText);
        return { total: 0, items: [] };
      }

      const data = await response.json();
      const rawItems = Array.isArray(data?.items) ? data.items : [];

      const items = rawItems
        .filter(item => {
          const id = item && (item._id || item.id);
          return id && SAFE_VOICE_ID_REGEX.test(id);
        })
        .map(item => {
          const id = item._id || item.id;
          const sample = Array.isArray(item.samples) && item.samples[0] ? item.samples[0] : null;
          const sampleAudioRaw = sample ? (sample.audio || sample.audio_url || sample.url) : null;
          return {
            id,
            title: String(item.title || 'Untitled Voice').slice(0, 100),
            description: String(item.description || '').slice(0, 300),
            author: item.author ? String(item.author.nickname || item.author.username || 'Community') : 'Community',
            coverImage: VoiceService.sanitizeHttpsUrl(item.cover_image || item.image),
            tags: Array.isArray(item.tags) ? item.tags.slice(0, 10).map(t => String(t).slice(0, 30)) : [],
            sampleAudio: VoiceService.sanitizeHttpsUrl(sampleAudioRaw)
          };
        });

      return {
        total: Number(data?.total) || items.length,
        items
      };
    } catch (err) {
      console.warn('[VoiceService] Voice search network error:', err.message);
      return { total: 0, items: [] };
    }
  }

  /**
   * Upload and create a private custom voice model on Fish Audio
   * @param {Object} params
   * @param {string} params.title
   * @param {string} [params.description]
   * @param {string} params.audioDataUrl
   * @returns {Promise<{ id: string, title: string }>}
   */
  async createCustomVoice({ title, description = '', audioDataUrl }) {
    if (!(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)) {
      throw new AIError('Fish Audio API key is not configured on the server', 503);
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new ValidationError('Voice title is required', 'title');
    }

    const cleanTitle = title.trim().slice(0, 100);

    if (!audioDataUrl || typeof audioDataUrl !== 'string') {
      throw new ValidationError('Audio sample data URL is required', 'audio');
    }

    const match = audioDataUrl.match(/^data:audio\/(wav|wave|mp3|mpeg|ogg|webm);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      throw new ValidationError('Only valid WAV, MP3, OGG, or WebM audio data URLs are allowed', 'audio');
    }

    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length > 4 * 1024 * 1024) {
      throw new ValidationError('Audio sample must be under 4MB (10 to 30 seconds recommended)', 'audio');
    }

    const detected = VoiceService.detectAudioMagicBytes(buffer);
    if (!detected) {
      throw new ValidationError('Invalid or corrupted audio file signature', 'audio');
    }

    const { ext, mimeType } = detected;
    const sampleFilename = `voice_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;

    // 1. Archive audio sample to Cloudflare R2 backup
    await this.r2.uploadCustomVoiceSample({
      filename: sampleFilename,
      buffer,
      mimeType
    });

    // 2. Register custom model on Fish Audio API
    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: mimeType });
    formData.append('voices', audioBlob, sampleFilename);
    formData.append('title', cleanTitle);
    if (description) formData.append('description', String(description).slice(0, 300));
    formData.append('visibility', 'private');
    formData.append('type', 'tts');
    formData.append('train_mode', 'fast');

    try {
      const response = await fetch(`${config.FISH_AUDIO_BASE_URL}/model`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)}`
        },
        body: formData,
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new AIError(`Fish Audio voice creation failed (${response.status}): ${errorText}`, 502);
      }

      const result = await response.json();
      const modelId = result?.id || result?._id;

      if (!modelId || !SAFE_VOICE_ID_REGEX.test(modelId)) {
        throw new AIError('Fish Audio returned invalid voice model ID', 502);
      }

      return {
        id: modelId,
        title: cleanTitle
      };
    } catch (err) {
      if (err instanceof AIError || err instanceof ValidationError) throw err;
      throw new AIError(`Fish Audio voice model creation error: ${err.message}`, 502);
    }
  }

  /**
   * Translate spoken dialogue into natural Japanese with Fish Audio emotion tags
   * Uses quota-isolated Gemini 3.1 Flash Lite (500 RPD bucket)
   * @param {string} spokenDialogue
   * @param {Object} [character]
   * @returns {Promise<string>}
   */
  async translateWithEmotion(spokenDialogue, character = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIError('GEMINI_API_KEY not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = config.GEMINI_TRANSLATION_MODEL || 'gemini-3.1-flash-lite';
    const characterName = character.name || 'the character';
    const personality = character.personality ? `Character personality: ${character.personality.slice(0, 300)}` : '';

    const systemInstruction = `You are an expert anime voice director and localization specialist.
Your task is to translate spoken dialogue into natural conversational Japanese matching ${characterName}'s persona, and prepend acoustic emotion tags for Fish Audio TTS.

Allowed Fish Audio emotion tags: [pout], [sigh], [gasp], [chuckle], [laughs], [whisper], [sob], [angry], [shy], [blush].
Rules:
1. Translate ONLY the spoken text inside the <dialogue_to_translate> tags.
2. Select 1 or at most 2 fitting emotion tags that match the dialogue mood and prepend them at the start of sentences where fitting (e.g. "[pout] なんであんたって、いつも私の言うこと聞いてくれないのよ！").
3. DO NOT include explanations, romaji, English translations, or markdown formatting. Output ONLY the Japanese dialogue with bracket tags.
4. If the input is already in Japanese, keep it natural and only add the appropriate emotion tags.`;

    const sanitizedDialogue = sanitizePromptForGemini(spokenDialogue);
    const userPrompt = `${personality}\n\n<dialogue_to_translate>\n${sanitizedDialogue}\n</dialogue_to_translate>`;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          temperature: 0.3,
          maxOutputTokens: 250,
          safetySettings: PERMISSIVE_SAFETY_SETTINGS
        }
      });

      const rawOutput = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const filtered = VoiceService.filterEmotionTags(rawOutput);

      return (filtered || spokenDialogue).slice(0, 500).trim();
    } catch (err) {
      console.warn('[VoiceService] Gemini 3.1 Flash Lite translation notice:', err.message);
      // Fallback: return dialogue directly with a default tag
      return spokenDialogue.slice(0, 500).trim();
    }
  }

  /**
   * Synthesize character voice audio for a specific chat message turn
   * Enforces session ownership, authoritative SQL message loading, and Cloudflare R2 cache lookup.
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.sessionId
   * @param {string} params.messageId
   * @param {number} [params.variantIndex]
   * @returns {Promise<{ audioBuffer: Buffer, mimeType: string, cacheHit: boolean, jaText: string }>}
   */
  async synthesizeMessageVoice({ userId, sessionId, messageId, variantIndex = null }) {
    if (!(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)) {
      throw new AIError('Fish Audio API key is not configured on this server', 503);
    }

    if (!sessionId || !messageId) {
      throw new ValidationError('sessionId and messageId are required', 'messageId');
    }

    // 1. Authoritative Session & Ownership Verification
    const session = await this.sessionRepo.findById(sessionId, userId);
    if (!session) {
      throw new NotFoundError('Chat session not found or unauthorized');
    }

    const message = (session.messages || []).find(m => m.id === messageId);
    if (!message) {
      throw new NotFoundError('Target message not found in this chat session');
    }

    if (message.role !== 'model') {
      throw new ValidationError('Voice synthesis is only supported for character replies', 'role');
    }

    // 2. Resolve authoritative variant text
    const activeIdx = typeof variantIndex === 'number' && variantIndex >= 0 && variantIndex < (message.variants || []).length
      ? variantIndex
      : (message.selectedVariantIndex || 0);

    const variantText = message.variants?.[activeIdx]?.text || message.content || '';
    const spokenText = VoiceService.extractSpokenDialogue(variantText);

    // 3. Resolve active character voice
    const character = await this.charRepo.findById(session.characterId);
    const activeVoiceId = (session.voiceIdOverride || character?.voiceId || '').trim();

    if (!activeVoiceId) {
      throw new ValidationError('No voice model is assigned to this character or session', 'voice_id');
    }

    if (!SAFE_VOICE_ID_REGEX.test(activeVoiceId)) {
      throw new ValidationError('Configured voice ID has an invalid format', 'voice_id');
    }

    // 4. Content-addressed SHA-256 Cache Check (zero repeated credit spend)
    const cacheKey = `fish_audio:${activeVoiceId}:${spokenText}`;
    const sha256Hex = crypto.createHash('sha256').update(cacheKey).digest('hex');

    const cachedAudio = await this.r2.getCachedVoiceAudio(sha256Hex);
    if (cachedAudio && cachedAudio.buffer) {
      return {
        audioBuffer: cachedAudio.buffer,
        mimeType: cachedAudio.mimeType || 'audio/mpeg',
        cacheHit: true,
        jaText: ''
      };
    }

    // 5. Quota-isolated Japanese Translation (Gemini 3.1 Flash Lite)
    const jaText = await this.translateWithEmotion(spokenText, character || {});

    // 6. Fish Audio TTS Request
    const ttsUrl = `${config.FISH_AUDIO_BASE_URL}/v1/tts`;
    const ttsModel = config.FISH_AUDIO_MODEL || 's2.1-pro-free';
    const ttsPayload = {
      text: jaText,
      reference_id: activeVoiceId,
      format: 'mp3',
      model: ttsModel
    };

    let audioBuffer;
    try {
      const response = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(config.FISH_AUDIO_API_KEY || process.env.FISH_AUDIO_API_KEY)}`,
          'Content-Type': 'application/json',
          'model': ttsModel
        },
        body: JSON.stringify(ttsPayload),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new AIError(`Fish Audio TTS synthesis failed (${response.status}): ${errText}`, 502);
      }

      // Stream collector with 10MB maximum ceiling
      const chunks = [];
      let totalBytes = 0;
      const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          if (totalBytes > MAX_AUDIO_BYTES) {
            reader.cancel();
            throw new AIError('Synthesized audio exceeded 10MB limit', 502);
          }
          chunks.push(value);
        }
        audioBuffer = Buffer.concat(chunks);
      } else {
        const arrayBuf = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuf);
      }
    } catch (err) {
      if (err instanceof AIError || err instanceof ValidationError) throw err;
      throw new AIError(`Voice synthesis error: ${err.message}`, 502);
    }

    // 7. Asynchronous write to Cloudflare R2 cache (non-blocking)
    this.r2.putCachedVoiceAudio(sha256Hex, audioBuffer).catch(cacheErr => {
      console.warn('[VoiceService] R2 audio cache write warning:', cacheErr.message);
    });

    return {
      audioBuffer,
      mimeType: 'audio/mpeg',
      cacheHit: false,
      jaText
    };
  }
}

export const voiceService = new VoiceService();

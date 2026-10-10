import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from './BaseAIProvider.js';
import { AIError } from '../errors.js';
import { config } from '../../config/index.js';

/**
 * Concrete Gemini AI Provider Class (extends BaseAIProvider)
 */
export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
  }

  #getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIError('GEMINI_API_KEY not configured', 500);
    }
    return new GoogleGenAI({ apiKey });
  }

  get modelName() {
    return process.env.GEMINI_MODEL || config.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }

  get fallbackModelName() {
    return process.env.GEMINI_FALLBACK_MODEL || config.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
  }

  #getModelsToTry() {
    const list = [this.modelName];
    if (this.fallbackModelName && this.fallbackModelName !== this.modelName) {
      list.push(this.fallbackModelName);
    }
    return list;
  }

  /**
   * Polymorphic implementation of generateReply using Google Gemini
   */
  async generateReply(character, userMsg, memory = null, options = {}) {
    const ai = this.#getClient();
    const systemPrompt = this.buildSystemPrompt(character, options);
    const contents = [];

    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });

    contents.push({
      role: 'model',
      parts: [{
        text: `*${character.name} nods in acknowledgment, stepping fully into character.*\n\n${character.name}: "Understood. I am ${character.name} and will respond naturally in character."`
      }]
    });

    if (Array.isArray(memory) && memory.length > 0) {
      for (const msg of memory) {
        if (!msg || !msg.content || !msg.content.trim()) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: userMsg }]
    });

    const modelsToTry = this.#getModelsToTry();
    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents
        });

        const text = response.text?.trim();
        if (!text) {
          throw new AIError('Empty response from Gemini', 503);
        }

        return text;
      } catch (error) {
        lastError = error;
        console.error(`[GEMINI PROVIDER ERROR] Model '${currentModel}':`, error.message);

        const isRateLimitOrQuota =
          error.message?.includes('quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('RESOURCE_EXHAUSTED') ||
          error.status === 429;

        if (isRateLimitOrQuota && i < modelsToTry.length - 1) {
          const nextModel = modelsToTry[i + 1];
          console.warn(`[GEMINI PROVIDER] Rate limit/quota reached on ${currentModel}. Falling back to ${nextModel}...`);
          continue;
        }

        break;
      }
    }

    if (lastError.message?.includes('quota') || lastError.message?.includes('rate limit') || lastError.message?.includes('RESOURCE_EXHAUSTED') || lastError.status === 429) {
      throw new AIError('Gemini quota exceeded', 429, lastError);
    }
    if (lastError.message?.includes('API_KEY') || lastError.status === 401) {
      throw new AIError('Invalid Gemini API key', 401, lastError);
    }
    if (lastError.status === 403) {
      throw new AIError('Gemini access forbidden', 403, lastError);
    }

    throw new AIError(lastError.message || 'Gemini service temporarily unavailable', 503, lastError);
  }

  /**
   * Generate a complete Character.AI profile from a brief user concept
   */
  async generateCharacterProfile(concept) {
    const ai = this.#getClient();
    const prompt = `You are an expert Character.AI character designer.
Create a rich, immersive roleplay character profile based on the following concept:
"${concept}"

Return STRICT JSON with the following keys:
{
  "name": "Character's full name",
  "tagline": "Short catchy subtitle (under 70 characters)",
  "greeting": "Opening roleplay scene with *italicized action* on one line and Character Name: \\"Dialogue\\" on a new line",
  "personality": "Detailed personality traits, temperament, flaws, and motivations",
  "appearance": "Detailed physical appearance, clothing, and signature visual traits",
  "abilities": "Skills, powers, talents, or expertise",
  "background": "Compelling backstory and origin",
  "speaking_style": "Tone of voice, speech patterns, and mannerisms",
  "example_dialogues": "1-2 sample exchanges in light-novel format",
  "initial_memory": "3-5 core facts or memories this character always remembers",
  "categories": ["Roleplay", "Original"]
}`;

    const modelsToTry = this.#getModelsToTry();
    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const rawText = (response.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        return JSON.parse(rawText);
      } catch (error) {
        lastError = error;
        console.error(`[GEMINI PROVIDER ERROR] Profile creation on '${currentModel}':`, error.message);

        const isRateLimitOrQuota =
          error.message?.includes('quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('RESOURCE_EXHAUSTED') ||
          error.status === 429;

        if (isRateLimitOrQuota && i < modelsToTry.length - 1) {
          const nextModel = modelsToTry[i + 1];
          console.warn(`[GEMINI PROVIDER] Falling back to ${nextModel} for character creation...`);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}

export const geminiProvider = new GeminiProvider();

export async function chatWithGemini(character, userMsg, memory = null, options = {}) {
  return geminiProvider.generateReply(character, userMsg, memory, options);
}

export async function generateCharacterFromConcept(concept) {
  return geminiProvider.generateCharacterProfile(concept);
}

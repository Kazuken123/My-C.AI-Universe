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
    return process.env.GEMINI_MODEL || config.GEMINI_MODEL || 'gemini-2.5-flash';
  }

  /**
   * Polymorphic implementation of generateReply using Google Gemini
   */
  async generateReply(character, userMsg, memory = null, options = {}) {
    try {
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

      const response = await ai.models.generateContent({
        model: this.modelName,
        contents
      });

      const text = response.text?.trim();
      if (!text) {
        throw new AIError('Empty response from Gemini', 503);
      }

      return text;
    } catch (error) {
      console.error('[GEMINI PROVIDER ERROR]', error.message);

      if (error.message?.includes('quota') || error.message?.includes('rate limit') || error.status === 429) {
        throw new AIError('Gemini quota exceeded', 429, error);
      }
      if (error.message?.includes('API_KEY') || error.status === 401) {
        throw new AIError('Invalid Gemini API key', 401, error);
      }
      if (error.status === 403) {
        throw new AIError('Gemini access forbidden', 403, error);
      }

      throw new AIError(error.message || 'Gemini service temporarily unavailable', 503, error);
    }
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

    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const rawText = (response.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(rawText);
  }
}

export const geminiProvider = new GeminiProvider();

export async function chatWithGemini(character, userMsg, memory = null, options = {}) {
  return geminiProvider.generateReply(character, userMsg, memory, options);
}

export async function generateCharacterFromConcept(concept) {
  return geminiProvider.generateCharacterProfile(concept);
}

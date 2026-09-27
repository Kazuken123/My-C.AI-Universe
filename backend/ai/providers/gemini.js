import { GoogleGenAI } from '@google/genai';
import { AIError } from '../errors.js';
import { config } from '../../config/index.js';
import { generateCharacterPrompt } from '../prompt/characterPrompt.js';

/**
 * Chat with Google Gemini AI provider
 * @param {Object} character - Character object
 * @param {string} userMsg - User message or instruction
 * @param {Array} memory - Conversation history array
 * @param {Object} options - Context options (persona, pinnedMessages, memories)
 * @returns {Promise<string>} AI response text
 */
export async function chatWithGemini(character, userMsg, memory = null, options = {}) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIError('GEMINI_API_KEY not configured', 500);
    }

    const modelName = process.env.GEMINI_MODEL || config.GEMINI_MODEL || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = generateCharacterPrompt(character, options);
    const contents = [];

    // Prime character roleplay context
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

    // Add conversation history (excluding empty messages)
    if (Array.isArray(memory) && memory.length > 0) {
      for (const msg of memory) {
        if (!msg || !msg.content || !msg.content.trim()) continue;
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Add current prompt/message
    contents.push({
      role: 'user',
      parts: [{ text: userMsg }]
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents
    });

    const text = response.text?.trim();
    if (!text) {
      throw new AIError('Empty response from Gemini', 503);
    }

    return text;
  } catch (error) {
    console.error('[GEMINI ERROR]', error.message);

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
 * Generate a complete Character.AI profile from a brief user concept using Gemini
 * @param {string} concept - Short character concept or description
 * @returns {Promise<Object>} Structured character fields
 */
export async function generateCharacterFromConcept(concept) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIError('GEMINI_API_KEY not configured', 500);
  }

  const modelName = process.env.GEMINI_MODEL || config.GEMINI_MODEL || 'gemini-2.5-flash';
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are an expert Character.AI character designer.
Create a rich, immersive roleplay character profile based on the following concept:
"${concept}"

Return STRICT JSON with the following keys (no markdown fences, no commentary outside JSON):
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
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });

  const rawText = (response.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(rawText);
}

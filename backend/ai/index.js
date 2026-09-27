import { chatWithGemini, chatWithOllama } from './providers/index.js';
import { config } from '../config/index.js';

// Sequential queue to prevent rate limiting bursts
const requestQueue = [];
let isProcessing = false;

/**
 * Generate a contextual in-character fallback reply when external AI providers are unreachable or rate-limited
 * @param {Object} character - Character object
 * @param {string} userMsg - User message
 * @param {Object} options - Context options
 * @returns {string} In-character fallback response
 */
function buildInCharacterFallback(character, userMsg, options = {}) {
  const name = character.name || 'Character';
  const userName = options.persona?.name || 'friend';
  const cleanInput = (userMsg || '').replace(/^Relevant memories:[\s\S]*?User message:\s*/i, '').trim();

  const styleHint = character.tagline ? `(${character.tagline})` : '';
  return `*${name} ${styleHint ? styleHint + ' ' : ''}pauses thoughtfully, considering what ${userName} just said.*\n\n${name}: "I hear you—'${cleanInput.slice(0, 90)}${cleanInput.length > 90 ? '...' : ''}'. Give me just a moment to gather my thoughts on that, ${userName}."`;
}

/**
 * Send a message to the selected AI provider (Gemini primary, Ollama optional/fallback)
 * @param {Object} character - Character object
 * @param {string} userMsg - User message or prompt
 * @param {Array} memory - Conversation history array
 * @param {Object} options - { provider, persona, pinnedMessages, memories }
 * @returns {Promise<string>} AI response
 */
export async function chatWithAI(character, userMsg, memory = null, options = {}) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ character, userMsg, memory, options, resolve, reject });
    if (!isProcessing) {
      processQueue();
    }
  });
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const { character, userMsg, memory, options, resolve } = requestQueue.shift();
    const preferredProvider = (options?.provider || config.AI_PROVIDER || 'gemini').toLowerCase();

    try {
      let response;
      if (preferredProvider === 'ollama') {
        try {
          response = await chatWithOllama(character, userMsg, memory, options);
        } catch (ollamaErr) {
          console.warn('[AI] Ollama failed, attempting Gemini fallback:', ollamaErr.message);
          response = await chatWithGemini(character, userMsg, memory, options);
        }
      } else {
        try {
          response = await chatWithGemini(character, userMsg, memory, options);
        } catch (geminiErr) {
          console.warn('[AI] Gemini error, checking Ollama fallback:', geminiErr.message);
          try {
            response = await chatWithOllama(character, userMsg, memory, options);
          } catch {
            // Graceful in-character fallback so UI remains responsive even if API quota is exhausted
            response = buildInCharacterFallback(character, userMsg, options);
          }
        }
      }

      resolve(response);
      await new Promise(r => setTimeout(r, 400));
    } catch (error) {
      console.error('[AI QUEUE ERROR]', error.message);
      resolve(buildInCharacterFallback(character, userMsg, options));
    }
  }

  isProcessing = false;
}

import { BaseAIProvider } from './BaseAIProvider.js';
import { AIError } from '../errors.js';
import { config } from '../../config/index.js';

/**
 * Concrete Ollama Local AI Provider Class (extends BaseAIProvider)
 */
export class OllamaProvider extends BaseAIProvider {
  constructor() {
    super('ollama');
  }

  /**
   * Polymorphic implementation of generateReply using local Ollama server
   */
  async generateReply(character, userMsg, memory = null, options = {}) {
    try {
      const userName = options.persona?.name || 'User';
      const conversationHistory = this.buildHistoryText(memory, character.name, userName);
      const systemPrompt = this.buildSystemPrompt(character, options);

      const prompt = `${systemPrompt}

${conversationHistory}${userName}: ${userMsg}

${character.name}:`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.AI_TIMEOUT || 30000);

      const res = await fetch(`${config.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL || 'qwen2.5:1.5b',
          prompt,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text();
        throw new AIError(`Ollama HTTP ${res.status}: ${text}`, 503);
      }

      const data = await res.json();
      const response = (data.response || '').trim();

      if (!response) {
        throw new AIError('Empty response from Ollama', 503);
      }

      return response;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new AIError('Ollama request timeout', 504);
      }
      console.error('[OLLAMA PROVIDER ERROR]', error.message);
      throw new AIError('Ollama service unavailable. Ensure `ollama serve` is running.', 503, error);
    }
  }
}

export const ollamaProvider = new OllamaProvider();

export async function chatWithOllama(character, userMsg, memory = null, options = {}) {
  return ollamaProvider.generateReply(character, userMsg, memory, options);
}

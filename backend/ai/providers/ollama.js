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
      const prompt = this.buildFullPrompt(character, userMsg, memory, options);

      const res = await this.fetchWithTimeout(`${config.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.OLLAMA_MODEL || 'qwen2.5:1.5b',
          prompt,
          stream: false
        }),
        signal: options?.signal,
        timeout: options?.timeout
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[OLLAMA UPSTREAM HTTP ${res.status}]`, text.slice(0, 300));
        throw new AIError(`Ollama upstream service returned HTTP ${res.status}`, 503);
      }

      const data = await res.json();
      const response = (data.response || '').trim();

      if (!response) {
        throw new AIError('Empty response from Ollama', 503);
      }

      return response;
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new AIError('Ollama request cancelled by client', 499, error);
      }
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new AIError('Ollama request timeout', 504);
      }
      if (error instanceof AIError) {
        throw error;
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

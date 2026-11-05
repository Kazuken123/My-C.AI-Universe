import { BaseAIProvider } from './BaseAIProvider.js';
import { AIError } from '../errors.js';
import { config } from '../../config/index.js';

/**
 * Concrete Modal Serverless Gemma 4 AI Provider Class (extends BaseAIProvider)
 * Connects to Modal's OpenAI-compatible serverless /v1/chat/completions endpoint.
 *
 * Configured with Google's recommended Gemma 4 parameters:
 * - temperature: 1.0
 * - top_p: 0.95
 * - top_k: 64
 *
 * Strips <thought>...</thought> from visible user roleplay output and enforces
 * clean multi-turn history sanitization.
 */
export class ModalGemmaProvider extends BaseAIProvider {
  constructor() {
    super('modal_gemma');
  }

  get endpointUrl() {
    return (
      process.env.MODAL_GEMMA_ENDPOINT ||
      process.env.MODAL_ENDPOINT_URL ||
      process.env.MODAL_GEMMA_URL ||
      process.env.MODAL_API_URL ||
      'https://your-workspace--cai-gemma4-serverless-fastapi-app.modal.run'
    ).replace(/\/+$/, '');
  }

  get apiKey() {
    return process.env.MODAL_API_KEY || 'universe-secret-key-2026';
  }

  get modelName() {
    return process.env.MODAL_MODEL || 'gemma-4-thinking';
  }

  /**
   * Builds system prompt for Gemma 4.
   * Kana Arima's LoRA adapter already encodes the 25 many-shot exemplars and cognitive structure
   * in its weights, so we omit redundant exemplar repetition (options.skipExemplars = true)
   * to conserve GPU VRAM and keep inference latency under 2 seconds.
   */
  buildSystemPrompt(character, options = {}) {
    return super.buildSystemPrompt(character, { ...options, skipExemplars: true });
  }

  /**
   * Builds sanitized OpenAI-compatible message array for Gemma 4.
   * Multi-Turn Invariant: Historical model turns strictly strip past thoughts
   * so Gemma 4 always reasons fresh for the current turn.
   */
  #buildMessages(character, userMsg, memory = null, options = {}) {
    const safeOptions = options || {};
    const messages = [];

    // System prompt with character definition and lorebook
    const systemPrompt = this.buildSystemPrompt(character, safeOptions);
    messages.push({ role: 'system', content: systemPrompt });

    // Multi-turn conversation history
    if (Array.isArray(memory)) {
      for (const msg of memory) {
        if (!msg || !msg.content || !msg.content.trim()) continue;
        const role = msg.role === 'user' ? 'user' : 'assistant';
        let content = msg.content;

        if (role === 'assistant') {
          // Strip any past <thought> or [[REL_STATE]] tags from conversation history
          content = content
            .replace(/<(?:thought|subtext)>[\s\S]*?<\/(?:thought|subtext)>/gi, '')
            .replace(/\[\[REL_STATE:[\s\S]*?\]\]/gi, '')
            .trim();
        }

        if (content) {
          messages.push({ role, content });
        }
      }
    }

    // Active user prompt
    messages.push({ role: 'user', content: userMsg.trim() });
    return messages;
  }

  /**
   * Polymorphic generateReply implementation calling Modal /v1/chat/completions
   */
  async generateReply(character, userMsg, memory = null, options = {}) {
    try {
      const messages = this.#buildMessages(character, userMsg, memory, options);
      const url = `${this.endpointUrl}/v1/chat/completions`;

      const requestPayload = {
        model: this.modelName,
        messages,
        temperature: typeof options?.temperature === 'number' ? options.temperature : 1.0,
        top_p: typeof options?.top_p === 'number' ? options.top_p : 0.95,
        top_k: typeof options?.top_k === 'number' ? options.top_k : 64,
        max_tokens: options?.max_tokens || 1024,
        stream: false
      };

      const res = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestPayload),
        signal: options?.signal,
        timeout: options?.timeout || config.MODAL_TIMEOUT || 120000
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[MODAL GEMMA HTTP ${res.status}]`, errText.slice(0, 300));
        throw new AIError(`Modal Gemma upstream returned HTTP ${res.status}`, res.status >= 500 ? 503 : res.status);
      }

      const data = await res.json();
      const rawResponse = data?.choices?.[0]?.message?.content || '';

      if (!rawResponse.trim()) {
        throw new AIError('Empty response from Modal Gemma server', 503);
      }

      return rawResponse.trim();
    } catch (error) {
      if (options?.signal?.aborted) {
        throw new AIError('Modal Gemma request cancelled by client', 499, error);
      }
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new AIError('Modal Gemma request timed out (cold start or scaling)', 504);
      }
      if (error instanceof AIError) {
        throw error;
      }
      console.error('[MODAL GEMMA ERROR]', error.message);
      throw new AIError(`Modal Gemma unavailable: ${error.message}`, 503, error);
    }
  }

  /**
   * Real-time streaming generation yielding tokens
   */
  async *generateReplyStream(character, userMsg, memory = null, options = {}) {
    const messages = this.#buildMessages(character, userMsg, memory, options);
    const url = `${this.endpointUrl}/v1/chat/completions`;

    const requestPayload = {
      model: this.modelName,
      messages,
      temperature: typeof options?.temperature === 'number' ? options.temperature : 1.0,
      top_p: typeof options?.top_p === 'number' ? options.top_p : 0.95,
      top_k: typeof options?.top_k === 'number' ? options.top_k : 64,
      max_tokens: options?.max_tokens || 1024,
      stream: true
    };

    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(requestPayload),
      signal: options?.signal,
      timeout: options?.timeout || config.MODAL_TIMEOUT || 120000
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AIError(`Modal Gemma streaming error HTTP ${res.status}: ${errText.slice(0, 200)}`, 503);
    }

    if (!res.body) {
      throw new AIError('Modal Gemma streaming body empty', 503);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.replace(/^data:\s*/, '');
          if (dataStr === '[DONE]') return;

          try {
            const parsed = JSON.parse(dataStr);
            const token = parsed?.choices?.[0]?.delta?.content;
            if (token) {
              yield token;
            }
          } catch {
            // Partial JSON chunk, ignore and continue
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const modalGemmaProvider = new ModalGemmaProvider();

export async function chatWithModalGemma(character, userMsg, memory = null, options = {}) {
  return modalGemmaProvider.generateReply(character, userMsg, memory, options);
}

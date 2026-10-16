import { geminiProvider, ollamaProvider } from './providers/index.js';
import { config } from '../config/index.js';

/**
 * AIOrchestrator Class (OOP Context & Queue Manager for AI Strategy Providers)
 * Manages provider selection, sequential rate-limit queueing, and automatic fallback.
 */
export class AIOrchestrator {
  constructor() {
    this.providers = new Map([
      ['gemini', geminiProvider],
      ['ollama', ollamaProvider]
    ]);
    this.requestQueue = [];
    this.isProcessing = false;
  }

  /**
   * Register a custom BaseAIProvider strategy
   */
  registerProvider(name, providerInstance) {
    this.providers.set(name.toLowerCase(), providerInstance);
  }

  /**
   * Enqueue a roleplay generation request
   */
  async chat(character, userMsg, memory = null, options = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ character, userMsg, memory, options, resolve, reject });
      if (!this.isProcessing) {
        this.#processQueue();
      }
    });
  }

  /**
   * Stream roleplay tokens directly in real time
   */
  async *chatStream(character, userMsg, memory = null, options = {}) {
    const preferredName = (options?.provider || config.AI_PROVIDER || 'gemini').toLowerCase();
    const primaryProvider = this.providers.get(preferredName) || geminiProvider;
    if (typeof primaryProvider.generateReplyStream === 'function') {
      for await (const token of primaryProvider.generateReplyStream(character, userMsg, memory, options)) {
        yield token;
      }
    } else {
      const fullReply = await this.chat(character, userMsg, memory, options);
      yield fullReply;
    }
  }

  async #processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const { character, userMsg, memory, options, resolve } = this.requestQueue.shift();
      const preferredName = (options?.provider || config.AI_PROVIDER || 'gemini').toLowerCase();
      const primaryProvider = this.providers.get(preferredName) || geminiProvider;
      const fallbackProvider = preferredName === 'ollama' ? geminiProvider : ollamaProvider;

      try {
        let response;
        try {
          response = await primaryProvider.generateReply(character, userMsg, memory, options);
        } catch (primaryErr) {
          console.warn(`[AI ORCHESTRATOR] ${primaryProvider.providerName} failed, trying fallback:`, primaryErr.message);
          try {
            response = await fallbackProvider.generateReply(character, userMsg, memory, options);
          } catch {
            response = this.#buildInCharacterFallback(character, userMsg, options);
          }
        }

        resolve(response);
        await new Promise(r => setTimeout(r, 50));
      } catch (error) {
        console.error('[AI ORCHESTRATOR ERROR]', error.message);
        resolve(this.#buildInCharacterFallback(character, userMsg, options));
      }
    }

    this.isProcessing = false;
  }

  #buildInCharacterFallback(character, userMsg, options = {}) {
    const name = character.name || 'Character';
    const userName = options.persona?.name || 'friend';
    const rawText = String(userMsg || '').trim();

    const isDirective =
      !rawText ||
      Boolean(options.isContinuation) ||
      rawText.includes('Directive') ||
      rawText.includes('Continue the scene') ||
      rawText.includes('[Scene Continuation') ||
      rawText.startsWith('[');

    const continuationBeats = [
      `*${name} stays close in the quiet moment, letting the air settle before looking over at ${userName}.*`,
      `*${name} glances toward ${userName}, waiting patiently to see where the moment leads.*`,
      `*${name} shifts slightly in the calm atmosphere, keeping a steady presence beside ${userName}.*`
    ];

    if (isDirective) {
      const excluded = Array.isArray(options.excludeVariants) ? options.excludeVariants : [];
      const availableBeats = continuationBeats.filter(b => !excluded.includes(b));
      const pool = availableBeats.length > 0 ? availableBeats : continuationBeats;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const replyBeats = [
      `*${name} pauses for a beat, looking at ${userName} with a thoughtful glance.*`,
      `*${name} blinks, caught slightly off guard, before steadying their focus on ${userName}.*`,
      `*${name} lets out a quiet breath, meeting ${userName}'s eyes as the room settles.*`,
      `*${name} shifts slightly, watching ${userName} with curiosity to see what they will do next.*`
    ];

    const excluded = Array.isArray(options.excludeVariants) ? options.excludeVariants : [];
    const availableBeats = replyBeats.filter(b => !excluded.includes(b));
    const pool = availableBeats.length > 0 ? availableBeats : replyBeats;

    return pool[Math.floor(Math.random() * pool.length)];
  }
}

export const aiOrchestrator = new AIOrchestrator();

export async function chatWithAI(character, userMsg, memory = null, options = {}) {
  return aiOrchestrator.chat(character, userMsg, memory, options);
}

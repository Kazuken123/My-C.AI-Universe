import { geminiProvider, ollamaProvider, modalGemmaProvider } from './providers/index.js';
import { normalizeProviderName, resolveProviderForCharacter } from './providerSelection.js';

/**
 * AIOrchestrator Class (OOP Context & Queue Manager for AI Strategy Providers)
 * Manages provider selection, sequential rate-limit queueing, and automatic fallback.
 */
export class AIOrchestrator {
  constructor() {
    this.providers = new Map([
      ['gemini', geminiProvider],
      ['ollama', ollamaProvider],
      ['modal_gemma', modalGemmaProvider]
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
   * Enqueue a roleplay generation request with per-character provider routing
   */
  async chat(character, userMsg, memory = null, options = {}) {
    const resolvedProvider = resolveProviderForCharacter(character, options?.provider, [...this.providers.keys()]);
    // Validate before enqueueing and snapshot selection so callers cannot mutate it in flight.
    const safeOptions = { ...options, provider: normalizeProviderName(resolvedProvider, [...this.providers.keys()]) };
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ character, userMsg, memory, options: safeOptions, resolve, reject });
      if (!this.isProcessing) {
        this.#processQueue().catch(error => {
          // No detached worker rejection may leave queued callers pending.
          for (const pending of this.requestQueue.splice(0)) pending.reject(error);
        });
      }
    });
  }

  /**
   * Stream roleplay tokens directly in real time with automatic fallback
   */
  async *chatStream(character, userMsg, memory = null, options = {}) {
    const preferredName = resolveProviderForCharacter(character, options?.provider, [...this.providers.keys()]);
    const safeOptions = { ...options, provider: preferredName };
    const primaryProvider = this.providers.get(preferredName);
    const fallbackName = preferredName === 'modal_gemma'
      ? 'gemini'
      : (preferredName === 'ollama' ? 'gemini' : 'ollama');
    const fallbackProvider = this.providers.get(fallbackName);

    if (typeof primaryProvider.generateReplyStream === 'function') {
      try {
        for await (const token of primaryProvider.generateReplyStream(character, userMsg, memory, safeOptions)) {
          yield token;
        }
      } catch (streamErr) {
        console.warn(`[AI ORCHESTRATOR] Primary streaming provider ${preferredName} failed, falling back to ${fallbackName}:`, streamErr?.message);
        if (fallbackProvider && typeof fallbackProvider.generateReplyStream === 'function') {
          for await (const token of fallbackProvider.generateReplyStream(character, userMsg, memory, safeOptions)) {
            yield token;
          }
        } else {
          const fullReply = await fallbackProvider.generateReply(character, userMsg, memory, safeOptions);
          yield fullReply;
        }
      }
    } else {
      const fullReply = await this.chat(character, userMsg, memory, safeOptions);
      yield fullReply;
    }
  }

  async #processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    this.isProcessing = true;

    try {
      while (this.requestQueue.length > 0) {
        const { character, userMsg, memory, options, resolve, reject } = this.requestQueue.shift();
        try {
          const preferredName = resolveProviderForCharacter(character, options?.provider, [...this.providers.keys()]);
          const primaryProvider = this.providers.get(preferredName);
          const fallbackName = preferredName === 'modal_gemma'
            ? 'gemini'
            : (preferredName === 'ollama' ? 'gemini' : 'ollama');
          const fallbackProvider = this.providers.get(fallbackName);
          let response;
          try {
            response = await primaryProvider.generateReply(character, userMsg, memory, options);
          } catch (primaryErr) {
            console.warn(`[AI ORCHESTRATOR] Primary provider ${preferredName} failed, trying fallback (${fallbackName}):`, primaryErr?.message);
            try {
              response = await fallbackProvider.generateReply(character, userMsg, memory, options);
            } catch (fallbackError) {
              if (options.requireComplete) throw fallbackError;
              response = this.#buildInCharacterFallback(character, userMsg, options);
            }
          }
          resolve(response);
        } catch (error) {
          reject(error);
        }
        await new Promise(r => setTimeout(r, 50));
      }
    } finally {
      this.isProcessing = false;
    }
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

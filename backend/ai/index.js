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
        await new Promise(r => setTimeout(r, 350));
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
      `*${name} stays close and observes in the quiet moment, keeping watch over ${userName}.*\n\n${name}: "I'm right here with you. Just take your time, ${userName}."`,
      `*${name} glances softly at ${userName}, letting the quiet air linger for a beat.*\n\n${name}: "No rush at all. We have plenty of time, ${userName}."`,
      `*${name} gently shifts position in the quiet room, keeping a warm presence beside ${userName}.*\n\n${name}: "I'm not going anywhere. Take as much time as you need."`
    ];

    if (isDirective) {
      const excluded = Array.isArray(options.excludeVariants) ? options.excludeVariants : [];
      const availableBeats = continuationBeats.filter(b => !excluded.includes(b));
      const pool = availableBeats.length > 0 ? availableBeats : continuationBeats;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const replyBeats = [
      `*${name} turns toward ${userName}, meeting their gaze with steady attention.*\n\n${name}: "Go on, ${userName}. I'm listening—tell me what's on your mind."`,
      `*${name} pauses for a brief moment, considering ${userName}'s words carefully before offering a faint nod.*\n\n${name}: "I see what you mean, ${userName}. Let's talk this through."`,
      `*${name} takes a slow breath and steps a little closer, focusing entirely on ${userName}.*\n\n${name}: "You have my full attention, ${userName}. What happens next?"`,
      `*${name} tilts their head slightly, a thoughtful expression crossing their face as they look at ${userName}.*\n\n${name}: "That caught my attention, ${userName}. Tell me more."`
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

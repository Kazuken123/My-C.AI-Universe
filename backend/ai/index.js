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
    const styleHint = character.tagline ? `(${character.tagline})` : '';

    const isDirective = !userMsg || userMsg.includes('Directive') || userMsg.includes('Continue the scene') || userMsg.includes('[Scene Continuation') || userMsg.trim().startsWith('[');
    if (isDirective) {
      const beats = [
        `*${name} ${styleHint ? styleHint + ' ' : ''}stays close and observes in the quiet moment, keeping watch over ${userName}.*\n\n${name}: "I'm right here with you. Just take your time and rest, ${userName}."`,
        `*${name} ${styleHint ? styleHint + ' ' : ''}glances softly at ${userName}, letting the quiet air linger for a beat.*\n\n${name}: "No rush at all. We have plenty of time, ${userName}."`,
        `*${name} ${styleHint ? styleHint + ' ' : ''}gently shifts position in the quiet room, keeping a warm presence beside ${userName}.*\n\n${name}: "I'm not going anywhere. Take as much time as you need."`
      ];
      return beats[Math.floor(Math.random() * beats.length)];
    }

    const cleanInput = (userMsg || '').replace(/^Relevant memories:[\s\S]*?User message:\s*/i, '').trim();
    return `*${name} ${styleHint ? styleHint + ' ' : ''}pauses thoughtfully, considering what ${userName} just said.*\n\n${name}: "I hear you—'${cleanInput.slice(0, 90)}${cleanInput.length > 90 ? '...' : ''}'. Give me just a moment to gather my thoughts on that, ${userName}."`;
  }
}

export const aiOrchestrator = new AIOrchestrator();

export async function chatWithAI(character, userMsg, memory = null, options = {}) {
  return aiOrchestrator.chat(character, userMsg, memory, options);
}

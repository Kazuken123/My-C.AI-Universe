import { generateCharacterPrompt, generateConversationHistory, buildVariationNote } from '../prompt/characterPrompt.js';
import { config } from '../../config/index.js';

/**
 * Abstract Base AI Provider Class (OOP Strategy Pattern Base)
 * Encapsulates prompt compilation, conversation formatting, and timeout-guarded HTTP execution.
 */
export class BaseAIProvider {
  /**
   * @param {string} providerName
   */
  constructor(providerName) {
    if (new.target === BaseAIProvider) {
      throw new TypeError('Cannot instantiate abstract class BaseAIProvider directly');
    }
    this.providerName = providerName;
  }

  /**
   * Build the full character system prompt with persona, pinned messages, and memories
   */
  buildSystemPrompt(character, options = {}) {
    return generateCharacterPrompt(character, options);
  }

  /**
   * Build plain-text conversation history
   */
  buildHistoryText(memory, characterName, userName = 'User') {
    return generateConversationHistory(memory, characterName, userName);
  }

  /**
   * Build complete text-completion prompt combining system instruction, history, and active turn
   */
  buildFullPrompt(character, userMsg, memory = null, options = {}) {
    const safeOptions = options || {};
    const charName = character?.name || 'Character';
    const userName = safeOptions.persona?.name || 'User';
    const conversationHistory = this.buildHistoryText(memory, charName, userName);
    const systemPrompt = this.buildSystemPrompt(character, safeOptions);
    const variationNote = buildVariationNote(memory, charName);

    return `${systemPrompt}\n\n${conversationHistory}${userName}: ${userMsg}\n\n${variationNote ? variationNote + '\n\n' : ''}${charName}:`;
  }

  /**
   * Execute HTTP fetch with automatic AbortController timeout management
   */
  async fetchWithTimeout(url, fetchOptions = {}, timeoutMs = config.AI_TIMEOUT || 30000) {
    const opts = fetchOptions || {};
    const controller = new AbortController();
    const timeout = opts.timeout || timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeout);

    let combinedSignal = controller.signal;
    let removeCallerListener = null;

    if (opts.signal) {
      if (opts.signal.aborted) {
        controller.abort(opts.signal.reason);
      } else if (typeof AbortSignal.any === 'function') {
        combinedSignal = AbortSignal.any([controller.signal, opts.signal]);
      } else {
        const onCallerAbort = () => controller.abort(opts.signal.reason);
        opts.signal.addEventListener('abort', onCallerAbort, { once: true });
        removeCallerListener = () => opts.signal.removeEventListener('abort', onCallerAbort);
      }
    }

    try {
      const { signal: _s, timeout: _t, ...restOpts } = opts;
      return await fetch(url, {
        ...restOpts,
        signal: combinedSignal
      });
    } finally {
      clearTimeout(timeoutId);
      if (removeCallerListener) removeCallerListener();
    }
  }

  /**
   * Abstract polymorphic method to be implemented by concrete AI provider subclasses
   */
  async generateReply(_character, _userMsg, _memory = null, _options = {}) {
    throw new Error(`Method generateReply() must be implemented by ${this.constructor.name}`);
  }
}

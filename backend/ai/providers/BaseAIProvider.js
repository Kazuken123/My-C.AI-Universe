import { generateCharacterPrompt, generateConversationHistory } from '../prompt/characterPrompt.js';

/**
 * Abstract Base AI Provider Class (OOP Strategy Pattern Base)
 * Defines the polymorphic interface for all LLM providers (Gemini, Ollama, etc.).
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
   * Abstract polymorphic method to be implemented by concrete AI provider subclasses
   * @param {Object} _character
   * @param {string} _userMsg
   * @param {Array} _memory
   * @param {Object} _options
   * @returns {Promise<string>}
   */
  async generateReply(_character, _userMsg, _memory = null, _options = {}) {
    throw new Error(`Method generateReply() must be implemented by ${this.constructor.name}`);
  }
}

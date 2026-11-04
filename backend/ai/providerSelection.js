import { config } from '../config/index.js';
import { ValidationError } from './errors.js';

export function normalizeProviderName(provider = config.AI_PROVIDER || 'gemini', allowed = ['gemini', 'ollama', 'modal_gemma']) {
  if (typeof provider !== 'string' || !allowed.includes(provider.trim().toLowerCase())) {
    throw new ValidationError(`Provider must be one of: ${allowed.join(', ')}`, 'provider');
  }
  return provider.trim().toLowerCase();
}

export function resolveStoredProviderName(storedProvider, fallback = config.AI_PROVIDER || 'gemini', allowed = ['gemini', 'ollama', 'modal_gemma']) {
  if (typeof storedProvider === 'string' && allowed.includes(storedProvider.trim().toLowerCase())) {
    return storedProvider.trim().toLowerCase();
  }
  if (typeof fallback === 'string' && allowed.includes(fallback.trim().toLowerCase())) {
    return fallback.trim().toLowerCase();
  }
  return allowed[0];
}

export function isKanaArima(character) {
  if (!character) return false;
  const id = String(character.id || character._id || '').trim();
  const name = String(character.name || '').toLowerCase().trim();
  return id === '1766394139616' || name.includes('kana');
}

export function hasValidModalEndpoint() {
  const endpoint = process.env.MODAL_GEMMA_ENDPOINT || process.env.MODAL_ENDPOINT_URL || process.env.MODAL_GEMMA_URL;
  if (!endpoint || typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  return trimmed.length > 0 && !trimmed.includes('your-workspace');
}

/**
 * Hybrid Per-Character Provider Router:
 * - Kana Arima (1766394139616 or name containing 'kana'): routes to modal_gemma if MODAL_GEMMA_ENDPOINT
 *   or MODAL_ENDPOINT_URL is configured; otherwise falls back to gemini.
 * - All other characters (Gojo, Frieren, Sherlock Holmes, Robin, Son Goku, Math Teacher, etc.):
 *   routes to gemini (Gemini 3.5 Flash-Lite) unless the request explicitly specifies another valid provider.
 * - Invalid non-undefined provider requests strictly throw ValidationError (HTTP 400).
 *
 * @param {Object|string} character - Character object or name
 * @param {string} [requestedProvider] - Explicit provider requested by caller/user
 * @param {string[]} [allowed] - Allowed provider list
 * @returns {string} Target provider name ('modal_gemma', 'gemini', 'ollama')
 */
export function resolveProviderForCharacter(character, requestedProvider, allowed = ['gemini', 'ollama', 'modal_gemma']) {
  let normalizedRequested = undefined;
  if (requestedProvider !== undefined) {
    normalizedRequested = normalizeProviderName(requestedProvider, allowed);
  }

  if (isKanaArima(character)) {
    if (hasValidModalEndpoint()) {
      if (normalizedRequested === 'ollama') {
        return 'ollama';
      }
      return 'modal_gemma';
    }
    return (normalizedRequested && normalizedRequested !== 'modal_gemma') ? normalizedRequested : 'gemini';
  }

  // All other characters default to gemini unless an allowed alternative is explicitly requested
  if (normalizedRequested) {
    return normalizedRequested;
  }
  return 'gemini';
}

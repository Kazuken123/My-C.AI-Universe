import { config } from '../config/index.js';
import { ValidationError } from './errors.js';

export function normalizeProviderName(provider = config.AI_PROVIDER || 'gemini', allowed = ['gemini', 'ollama']) {
  if (typeof provider !== 'string' || !allowed.includes(provider.trim().toLowerCase())) {
    throw new ValidationError('Provider must be gemini or ollama', 'provider');
  }
  return provider.trim().toLowerCase();
}

export function resolveStoredProviderName(storedProvider, fallback = config.AI_PROVIDER || 'gemini', allowed = ['gemini', 'ollama']) {
  if (typeof storedProvider === 'string' && allowed.includes(storedProvider.trim().toLowerCase())) {
    return storedProvider.trim().toLowerCase();
  }
  if (typeof fallback === 'string' && allowed.includes(fallback.trim().toLowerCase())) {
    return fallback.trim().toLowerCase();
  }
  return allowed[0];
}

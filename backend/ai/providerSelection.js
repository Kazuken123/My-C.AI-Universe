import { config } from '../config/index.js';
import { ValidationError } from './errors.js';

export function normalizeProviderName(provider = config.AI_PROVIDER || 'gemini', allowed = ['gemini', 'ollama']) {
  if (typeof provider !== 'string' || !allowed.includes(provider.trim().toLowerCase())) {
    throw new ValidationError('Provider must be gemini or ollama', 'provider');
  }
  return provider.trim().toLowerCase();
}

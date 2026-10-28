/**
 * Utilities for character formatting, avatars, and catalog layout
 */

export function formatCount(num?: number | string | null): string {
  const n = Number(num) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'm';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function resolveAvatarUrl(avatar?: string | null, name = 'Character'): string {
  if (!avatar || !avatar.trim()) {
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(name.trim() || 'Hero')}`;
  }
  const clean = avatar.trim();
  if (clean.startsWith('/assets/avatars/')) {
    return `${clean}${clean.includes('?') ? '&' : '?'}v=5`;
  }
  return clean;
}

export const CHARACTER_CATEGORIES = [
  'All',
  'Roleplay',
  'Anime',
  'Original',
  'Sci-Fi',
  'Fantasy',
  'Gaming',
  'Philosophy',
  'Assistant',
] as const;

export type CharacterCategoryType = typeof CHARACTER_CATEGORIES[number];

export { RELATIONSHIP_PRESETS as RELATIONSHIP_STAGE_PRESETS } from '../../frontend/js/relationship-contract.js';

export const PRESET_AVATAR_SEEDS = [
  'CyberKnight',
  'AriaStar',
  'ShadowOperative',
  'EchoSorceress',
  'AtlasTitan',
  'PixelRenegade',
  'NexusSage',
  'ValkyrieVow',
] as const;

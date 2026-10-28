/**
 * Strips complete [[REL_STATE: ...]] tags AND any partial trailing tag
 * currently being streamed (e.g. "[[", "[[REL_", "[[REL_STATE: {...").
 */
export function stripStreamingRelState(text?: string | null): string {
  if (!text) return '';
  return text
    // 1. Strip complete [[REL_STATE: ...]] blocks anywhere in the text
    .replace(/\s*\[\[REL_STATE:[\s\S]*?\]\]/gi, '')
    // 2. Strip any incomplete trailing [[REL_STATE... prefix at the end of the stream
    .replace(/\s*\[\[(?:R(?:E(?:L(?:_(?:S(?:T(?:A(?:T(?:E(?::[\s\S]*)?)?)?)?)?)?)?)?)?)?$/i, '')
    .trimEnd();
}

/**
 * Lightweight relative time formatter (zero external dependencies)
 */
export function formatRelativeTime(dateInput?: string | Date | null): string {
  if (!dateInput) return 'just now';
  const timestamp = typeof dateInput === 'string' ? new Date(dateInput).getTime() : dateInput.getTime();
  if (isNaN(timestamp)) return 'recently';

  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  const diffYear = Math.floor(diffDay / 365);
  return `${diffYear}y ago`;
}

/**
 * Monogram / initials generator for avatar fallbacks
 */
export function getInitials(name?: string | null, fallback = 'TR'): string {
  const clean = String(name || '').trim();
  if (!clean) return fallback;
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

/**
 * Map affinity value (-100..+100) to a 0..100 percentage for progress bars
 */
export function calculateAffinityPercent(affinity = 0): number {
  return Math.min(100, Math.max(0, Math.round(((affinity + 100) / 200) * 100)));
}

export const AI_PROVIDERS = [
  { id: 'gemini', label: 'Gemini Flash 2.0 (Fast)' },
  { id: 'claude', label: 'Claude 3.5 Sonnet' },
  { id: 'groq', label: 'Groq Llama 3.3 (Ultra Fast)' },
  { id: 'ollama', label: 'Ollama Local' },
] as const;

export { RELATIONSHIP_MOODS } from '../../frontend/js/relationship-contract.js';

import type { ChatSessionSummary } from '@/types/chat';

export type DedupedChatSession = ChatSessionSummary & {
  threadCount: number;
};

/**
 * Deduplicate chat sessions by characterId while keeping the most recent session
 * and counting total thread branches per character.
 */
export function deduplicateSessionsByCharacter<T extends { characterId?: string }>(
  sessions?: T[] | null
): (T & { threadCount: number })[] {
  if (!Array.isArray(sessions)) return [];
  const map = new Map<string, T & { threadCount: number }>();
  for (const s of sessions) {
    if (!s || !s.characterId) continue;
    if (!map.has(s.characterId)) {
      map.set(s.characterId, { ...s, threadCount: 1 });
    } else {
      const existing = map.get(s.characterId)!;
      existing.threadCount += 1;
    }
  }
  return Array.from(map.values());
}


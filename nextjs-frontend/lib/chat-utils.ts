import type { ChatSessionSummary } from '@/types/chat';

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
  { id: 'gemini', label: 'Gemini 3.5 Flash Lite' },
  { id: 'modal_gemma', label: 'Gemma 4 31B Fine-Tuned (Modal GPU)' },
  { id: 'ollama', label: 'Ollama Local' },
] as const;

export function resolveSupportedProvider(provider?: string | null): 'gemini' | 'modal_gemma' | 'ollama' {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (normalized === 'modal_gemma') return 'modal_gemma';
  if (normalized === 'ollama') return 'ollama';
  return 'gemini';
}

export function removeSessionById<T extends { id?: string }>(
  sessions?: T[] | null,
  sessionId?: string
): T[] {
  if (!Array.isArray(sessions)) return [];
  if (!sessionId) return [...sessions];
  return sessions.filter((s) => s && s.id !== sessionId);
}

export { RELATIONSHIP_MOODS } from '../../frontend/js/relationship-contract.js';

export type DedupedChatSession = ChatSessionSummary & {
  threadCount: number;
};

const ACTIVE_SESSION_STORAGE_KEY = 'cai_active_session_by_char';

export function getActiveSessionForCharacter(characterId?: string | null): string | null {
  if (!characterId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map && typeof map === 'object' ? (map[characterId] || null) : null;
  } catch {
    return null;
  }
}

export function setActiveSessionForCharacter(characterId?: string | null, sessionId?: string | null): void {
  if (!characterId || !sessionId || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[characterId] = sessionId;
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage error
  }
}

/**
 * Clear the remembered active session for a character. When `expectedSessionId` is provided,
 * the entry is only cleared if it still points at that session (avoids clobbering a newer choice).
 */
export function clearActiveSessionForCharacter(characterId?: string | null, expectedSessionId?: string | null): void {
  if (!characterId || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return;
    const map = JSON.parse(raw);
    if (!map || typeof map !== 'object' || !(characterId in map)) return;
    if (expectedSessionId && map[characterId] !== expectedSessionId) return;
    delete map[characterId];
    localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage error
  }
}

function sessionTimestamp(s: { updatedAt?: string | Date | null; createdAt?: string | Date | null }): number {
  const t = Date.parse(String(s?.updatedAt || s?.createdAt || ''));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Deduplicate chat sessions by characterId. For each character keeps exactly one session:
 * the remembered active session if it is present in the input, otherwise the newest session by
 * `updatedAt || createdAt` (input order does not matter). Adds `threadCount`.
 * Output is sorted newest-first by the chosen session's timestamp.
 */
export function deduplicateSessionsByCharacter<T extends { id?: string; characterId?: string; updatedAt?: string | Date | null; createdAt?: string | Date | null }>(
  sessions?: T[] | null
): (T & { threadCount: number })[] {
  if (!Array.isArray(sessions)) return [];
  const groups = new Map<string, T[]>();
  for (const s of sessions) {
    if (!s || !s.characterId) continue;
    if (!groups.has(s.characterId)) groups.set(s.characterId, []);
    groups.get(s.characterId)!.push(s);
  }
  const result: (T & { threadCount: number })[] = [];
  for (const [characterId, list] of groups) {
    const activeId = getActiveSessionForCharacter(characterId);
    let chosen = activeId ? list.find(s => s.id === activeId) : null;
    if (!chosen) {
      chosen = list.reduce((best, s) => (sessionTimestamp(s) > sessionTimestamp(best) ? s : best), list[0]);
    }
    result.push({ ...chosen!, threadCount: list.length });
  }
  return result.sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
}

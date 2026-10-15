import assert from 'node:assert/strict';
import { deduplicateSessionsByCharacter } from '../frontend/js/common.js';
import { formatRelativeTime } from '../frontend/js/chat.js';

console.log('🧪 Running v2.5.6 Sidebar Deduplication & History Relative Time Tests...\n');

// Test 1: Deduplicate sessions by characterId
const mockSessions = [
  { id: 'sess_1', characterId: 'char_kana', characterName: 'Kana Arima', updatedAt: '2026-10-15T12:00:00Z', lastMessage: 'Latest Kana message' },
  { id: 'sess_2', characterId: 'char_gojo', characterName: 'Satoru Gojo', updatedAt: '2026-10-15T11:00:00Z', lastMessage: 'Latest Gojo message' },
  { id: 'sess_3', characterId: 'char_kana', characterName: 'Kana Arima', updatedAt: '2026-10-15T10:00:00Z', lastMessage: 'Old Kana message' },
  { id: 'sess_4', characterId: 'char_kana', characterName: 'Kana Arima', updatedAt: '2026-10-15T09:00:00Z', lastMessage: 'Oldest Kana message' },
  { id: 'sess_5', characterId: 'char_gojo', characterName: 'Satoru Gojo', updatedAt: '2026-10-15T08:00:00Z', lastMessage: 'Older Gojo message' }
];

const deduped = deduplicateSessionsByCharacter(mockSessions);

assert.equal(deduped.length, 2, 'Should only contain 2 unique characters');
assert.equal(deduped[0].characterId, 'char_kana', 'First entry should be Kana');
assert.equal(deduped[0].id, 'sess_1', 'First entry should be the most recent session for Kana');
assert.equal(deduped[0].threadCount, 3, 'Kana should have 3 threads recorded');
assert.equal(deduped[1].characterId, 'char_gojo', 'Second entry should be Gojo');
assert.equal(deduped[1].id, 'sess_2', 'Second entry should be the most recent session for Gojo');
assert.equal(deduped[1].threadCount, 2, 'Gojo should have 2 threads recorded');
console.log('✅ 1. deduplicateSessionsByCharacter: successfully deduplicated sessions per characterId preserving most recent thread and threadCount');

// Test 2: Edge cases for deduplication
assert.deepEqual(deduplicateSessionsByCharacter([]), [], 'Empty array should return empty array');
assert.deepEqual(deduplicateSessionsByCharacter(null), [], 'Null should return empty array');
console.log('✅ 2. deduplicateSessionsByCharacter: handled empty and null inputs safely');

// Test 3: formatRelativeTime formatting
const now = Date.now();
assert.equal(formatRelativeTime(new Date(now - 10 * 1000).toISOString()), 'less than a minute ago');
assert.equal(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString()), 'about 5 minutes ago');
assert.equal(formatRelativeTime(new Date(now - 60 * 1000).toISOString()), 'about 1 minute ago');
assert.equal(formatRelativeTime(new Date(now - 3 * 3600 * 1000).toISOString()), 'about 3 hours ago');
assert.equal(formatRelativeTime(new Date(now - 1 * 3600 * 1000).toISOString()), 'about 1 hour ago');
assert.equal(formatRelativeTime(new Date(now - 4 * 24 * 3600 * 1000).toISOString()), 'about 4 days ago');
assert.equal(formatRelativeTime(new Date(now - 65 * 24 * 3600 * 1000).toISOString()), 'about 2 months ago');
assert.equal(formatRelativeTime(new Date(now - 400 * 24 * 3600 * 1000).toISOString()), 'about 1 year ago');
assert.equal(formatRelativeTime(null), 'just now');
console.log('✅ 3. formatRelativeTime: verified relative time calculations across seconds, minutes, hours, days, months, and years');

console.log('\n✨ All v2.5.6 unit tests passed successfully!');

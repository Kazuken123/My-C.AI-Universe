import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadKanaLorebook() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'kanaLorebook.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

const kanaEntries = loadKanaLorebook();

export const LOREBOOK_REGISTRY = {
  // Kana Arima (Oshi no Ko Universe)
  'kana arima': kanaEntries
};

/**
 * Scan incoming user text and recent conversation context for triggered lorebook keywords.
 * Returns a clean markdown prompt block of matching entries, or empty string if no keywords match.
 *
 * @param {string} characterName - Name of the character (e.g. 'Kana Arima')
 * @param {string} textToScan - Combined user message and recent turn text
 * @returns {string} Formatted Lorebook markdown block or ''
 */
export function resolveLorebookEntries(characterName = '', textToScan = '') {
  if (!characterName || !textToScan) return '';

  const normalizedCharName = String(characterName).toLowerCase().trim();
  const loreEntries = LOREBOOK_REGISTRY[normalizedCharName] ||
    Object.entries(LOREBOOK_REGISTRY).find(([key]) => normalizedCharName.includes(key))?.[1] ||
    [];

  if (!loreEntries || loreEntries.length === 0) return '';

  const lowerText = String(textToScan).toLowerCase();
  const matched = [];

  for (const item of loreEntries) {
    const hitsKeyword = item.keywords.some(kw => {
      // Word boundary match to prevent false partial-word collisions
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(lowerText);
    });

    if (hitsKeyword) {
      matched.push(item.entry);
    }
  }

  if (matched.length === 0) return '';

  return `[ACTIVE UNIVERSE LOREBOOK (KEYWORD-TRIGGERED CONTEXT)]
${matched.map(entry => `- ${entry}`).join('\n')}
Use these universe facts naturally for grounded dialogue and situational nuance when relevant.`;
}

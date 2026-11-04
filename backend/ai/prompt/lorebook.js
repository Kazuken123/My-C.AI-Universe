import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadLorebookFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

// 1. Kana Arima (Oshi no Ko)
const kanaEntries = loadLorebookFile(path.join(__dirname, 'kanaLorebook.json'));

// 2-7. Multi-character Dynamic Lorebooks
const gojoEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'gojoLorebook.json'));
const frierenEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'frierenLorebook.json'));
const holmesEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'holmesLorebook.json'));
const robinEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'robinLorebook.json'));
const gokuEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'gokuLorebook.json'));
const mathTeacherEntries = loadLorebookFile(path.join(__dirname, 'lorebooks', 'mathTeacherLorebook.json'));

export const LOREBOOK_REGISTRY = {
  // Kana Arima (1766394139616)
  'kana arima': kanaEntries,
  'kana': kanaEntries,
  '1766394139616': kanaEntries,

  // Satoru Gojo (1766160797313)
  'satoru gojo': gojoEntries,
  'gojo': gojoEntries,
  'satoru': gojoEntries,
  '1766160797313': gojoEntries,

  // Frieren (1767000000001)
  'frieren': frierenEntries,
  '1767000000001': frierenEntries,

  // Sherlock Holmes (1767000000002)
  'sherlock holmes': holmesEntries,
  'sherlock': holmesEntries,
  'holmes': holmesEntries,
  '1767000000002': holmesEntries,

  // Robin (1790729561529)
  'robin': robinEntries,
  '1790729561529': robinEntries,

  // Son Goku (1791615352319 / 1767000000003)
  'son goku': gokuEntries,
  'goku': gokuEntries,
  '1791615352319': gokuEntries,
  '1767000000003': gokuEntries,

  // Math Teacher (1766395759555)
  'math teacher': mathTeacherEntries,
  'professor lin': mathTeacherEntries,
  'math': mathTeacherEntries,
  '1766395759555': mathTeacherEntries
};

/**
 * Scan incoming user text and recent conversation context for triggered lorebook keywords.
 * Returns a clean markdown prompt block of matching entries, or empty string if no keywords match.
 *
 * @param {string|Object} characterIdentifier - Character name, ID, or object { name, id }
 * @param {string} textToScan - Combined user message and recent turn text
 * @returns {string} Formatted Lorebook markdown block or ''
 */
export function resolveLorebookEntries(characterIdentifier = '', textToScan = '') {
  if (!characterIdentifier || !textToScan) return '';

  let charName = '';
  let charId = '';

  if (typeof characterIdentifier === 'object' && characterIdentifier !== null) {
    charName = String(characterIdentifier.name || '').toLowerCase().trim();
    charId = String(characterIdentifier.id || characterIdentifier._id || '').trim();
  } else {
    charName = String(characterIdentifier).toLowerCase().trim();
    charId = String(characterIdentifier).trim();
  }

  // Look up by ID first, then by exact name, then by partial name match
  let loreEntries = (charId && LOREBOOK_REGISTRY[charId]) ||
    (charName && LOREBOOK_REGISTRY[charName]) ||
    Object.entries(LOREBOOK_REGISTRY).find(([key]) => charName && charName.includes(key))?.[1] ||
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

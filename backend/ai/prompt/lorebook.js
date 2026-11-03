/**
 * Deep Lorebook Module
 * Provides keyword-triggered universe lore injection into character prompts.
 * Dynamic entries are injected below static Many-Shot exemplars to preserve Gemini Implicit Caching.
 */

export const LOREBOOK_REGISTRY = {
  // Kana Arima (Oshi no Ko Universe)
  'kana arima': [
    {
      id: 'b-komachi',
      keywords: ['b-komachi', 'b komachi', 'idol', 'center', 'white glowstick', 'stage outfit', 'dome', 'performance', 'choreography'],
      entry: 'B-Komachi: The idol group managed by Strawberry Productions, originally founded by legendary idol Ai Hoshino. Currently revived by Kana Arima (Center, signature White glowstick), Ruby Hoshino (Red glowstick), and Mem-Cho (Yellow glowstick). Kana takes her responsibilities as center with utmost seriousness, feeling the weight of the group on her shoulders.'
    },
    {
      id: 'aqua-hoshino',
      keywords: ['aqua', 'aquamarine', 'gorou', 'hoshino'],
      entry: 'Aqua Hoshino: Fellow Strawberry Productions member and actor. Kana harbors deep, complex, often unspoken romantic feelings for him. She oscillates between sharp, prickly banter to protect her pride and vulnerable trust when they are alone.'
    },
    {
      id: 'ruby-hoshino',
      keywords: ['ruby'],
      entry: 'Ruby Hoshino: Fellow B-Komachi idol, daughter of Ai Hoshino. Cheerful, fiercely determined, and constantly teasing Kana about her strict dieting, beauty regimen, and secret romantic yearnings.'
    },
    {
      id: 'mem-cho',
      keywords: ['mem-cho', 'memcho', 'mem'],
      entry: 'Mem-Cho: The oldest member of B-Komachi and former popular YouTuber. Pragmatic, observant, and emotionally intelligent; acts as an affectionate big sister and mediator during group disagreements.'
    },
    {
      id: 'baking-soda',
      keywords: ['baking soda', 'lick baking soda', 'child prodigy', 'commercial'],
      entry: 'Baking Soda: The notorious childhood moniker ("The genius child actress who can lick baking soda in 10 seconds") from a childhood commercial that went viral. A perennial source of intense embarrassment, indignation, and tsundere defensiveness when teased about it.'
    },
    {
      id: 'sweet-today',
      keywords: ['sweet today', 'kyouko', 'drama', 'adaptation'],
      entry: 'Sweet Today: The live-action manga drama adaptation where Kana and Aqua first reunited as teenagers. Kana initially dialed down her own acting to match amateur co-stars until Aqua provoked her into delivering her true, show-stopping emotional crying performance.'
    },
    {
      id: 'tokyo-blade',
      keywords: ['tokyo blade', 'tsurugi', '2.5d', 'stage play', 'lala lai'],
      entry: 'Tokyo Blade: The high-profile 2.5D stage play adaptation where Kana portrayed Tsurugi opposite Akane Kurokawa. An emotionally charged production where Kana shed her fear of outshining colleagues and embraced her inner acting brilliance.'
    },
    {
      id: 'akane-kurokawa',
      keywords: ['akane', 'kurokawa', 'lala lai'],
      entry: 'Akane Kurokawa: Method actress from the Lala Lai theatrical troupe and Kana\'s lifelong professional rival. Their relationship is a mix of mutual professional awe, fierce competitive tension, and frequent passive-aggressive verbal sparring.'
    },
    {
      id: 'strawberry-productions',
      keywords: ['strawberry', 'miyako', 'saitou', 'agency'],
      entry: 'Strawberry Productions: The boutique talent agency run by Miyako Saitou that manages B-Komachi and represents Kana. Offers a safe, familial shelter compared to the exploitative mainstream entertainment industry.'
    }
  ]
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

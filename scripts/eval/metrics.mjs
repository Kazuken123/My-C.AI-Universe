// Pure text metrics for character replies. No I/O, so it can be unit-tested.
import { ROMANCE_TERMS } from './scenarios.mjs';

const BANNED = ['delve', 'tapestry', 'testament', 'palpable', 'clenched', 'danced', 'pierce the silence', 'truth is',
  'you have to understand', 'can we just talk', 'atomic', 'vaporized', 'short-circuits', 'unadulterated', 'shatters',
  'writhing', 'mind-numbing'];

const words = text => (text.toLowerCase().match(/[a-z']+/g) || []);

export function lineKinds(text) {
  return text.split(/\n+/).map(l => l.trim()).filter(Boolean)
    .map(l => (/^\*[^*]/.test(l) && /\*$/.test(l) ? 'A' : 'D')).join('');
}

export function opener(text) {
  return words(text.split(/\n/).find(l => l.trim()) || '').slice(0, 4).join(' ');
}

export function replyMetrics(text, characterName = '') {
  const w = words(text);
  const lower = text.toLowerCase();
  const firstLine = (text.split(/\n/).find(l => l.trim()) || '').trim();
  const narration = (text.match(/\*[^*\n]+\*/g) || []).join(' ').toLowerCase();
  return {
    words: w.length,
    startsWithAction: /^\*[^*]/.test(firstLine),
    shape: lineKinds(text),
    opener: opener(text),
    ellipses: (text.match(/\.\.\.|\u2026/g) || []).length,
    emDashes: (text.match(/\u2014/g) || []).length,
    romanceHits: ROMANCE_TERMS.reduce((n, t) => n + (lower.split(t).length - 1), 0),
    bannedHits: BANNED.filter(t => lower.includes(t)),
    endsWithQuestion: /\?["\u201d*\s]*$/.test(text.trim()),
    // Narration that dictates the user's actions or feelings.
    controlsUser: /\byou (?:feel|realize|blush|smile|nod|lean|take|decide|reach|look|laugh|sigh|stand|sit|head|turn|walk|leave)\b/i.test(narration),
    speakerTagged: characterName ? text.includes(`${characterName}:`) : true
  };
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ratio = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : 0);

const STOP = new Set(('the a an and or but of to in on at for with from as is was are be been it its this that ' +
  'she he her his him they them their you your i me my we our not no just so if then than there here what ' +
  'into over up down out off about one more back before after again only like said says do does did have has ' +
  'had will would can could should still even very too also how when where who why which while slightly ' +
  'brief briefly small faint faintly don it\'s that\'s i\'m you\'re').split(' '));

// Share of replies whose first line begins with the character (name or pronoun) doing something:
// "*Mara picks up...", "*She glances...". High values mean one fixed opening template.
export function subjectOpenerRate(texts, characterName = '') {
  const first = (characterName.split(' ')[0] || '').toLowerCase();
  return ratio(texts, t => {
    const line = (t.split(/\n/).find(l => l.trim()) || '').trim();
    // A required speaker tag (Mara Voss: "...") is speech, not a subject-action template.
    if (!/^\*[^*]/.test(line)) return false;
    const w = words(line)[0] || '';
    return w === first || ['she', 'he', 'they', 'her', 'his'].includes(w);
  });
}

// Content words that recur in at least half of the replies (prop/gesture fixation).
export function recurringTerms(texts, characterName = '') {
  const skip = new Set(words(characterName));
  const counts = new Map();
  for (const t of texts) for (const w of new Set(words(t))) {
    if (w.length < 3 || STOP.has(w) || skip.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= Math.max(3, texts.length / 2)).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}x${n}`);
}

// Pairwise Jaccard similarity of word sets between consecutive replies.
function consecutiveSimilarity(texts) {
  const sims = [];
  for (let i = 1; i < texts.length; i++) {
    const a = new Set(words(texts[i - 1])), b = new Set(words(texts[i]));
    const inter = [...a].filter(x => b.has(x)).length;
    sims.push(inter / (a.size + b.size - inter || 1));
  }
  return mean(sims);
}

export function aggregate(turns, characterName = '') {
  const m = turns.map(t => replyMetrics(t.reply, characterName));
  const totalWords = m.reduce((a, x) => a + x.words, 0) || 1;
  return {
    turns: m.length,
    meanWords: Math.round(mean(m.map(x => x.words))),
    startsWithActionRate: ratio(m, x => x.startsWithAction),
    subjectOpenerRate: subjectOpenerRate(turns.map(t => t.reply), characterName),
    recurringTerms: recurringTerms(turns.map(t => t.reply), characterName),
    distinctOpenerRate: new Set(m.map(x => x.opener)).size / (m.length || 1),
    distinctShapeRate: new Set(m.map(x => x.shape)).size / (m.length || 1),
    consecutiveSimilarity: Number(consecutiveSimilarity(turns.map(t => t.reply)).toFixed(3)),
    ellipsesPer100w: Number((100 * m.reduce((a, x) => a + x.ellipses, 0) / totalWords).toFixed(2)),
    emDashesPer100w: Number((100 * m.reduce((a, x) => a + x.emDashes, 0) / totalWords).toFixed(2)),
    romanceHitsPerReply: Number(mean(m.map(x => x.romanceHits)).toFixed(2)),
    bannedHits: m.flatMap(x => x.bannedHits),
    endsWithQuestionRate: ratio(m, x => x.endsWithQuestion),
    controlsUserCount: m.filter(x => x.controlsUser).length
  };
}

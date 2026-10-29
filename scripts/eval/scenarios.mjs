// Scripted user turns for live response-quality evaluation.
// Scenarios are setting-agnostic so the same lines work for every character.

export const ORIGINAL_CHARACTER = {
  name: 'Mara Voss',
  tagline: 'Night-shift archivist at a city records office',
  personality: 'Reserved, precise, dry humor. Slow to trust, never gushes. Shows care through practical help rather than words.',
  background: 'Thirty-four. Has worked nights at the municipal archive for nine years. Prefers documents to people, but is fair and patient with visitors who are honest with her.',
  appearance: 'Short dark hair, reading glasses pushed up, cardigan with ink stains on the cuff.',
  speaking_style: 'Short sentences. Understated. Rarely uses exclamation marks. Answers questions literally before adding anything personal.',
  greeting: '*Mara looks up from a stack of property deeds, pen still in hand.*\n\nMara Voss: "We close at six. You have forty minutes. What do you need?"',
  initialAffinity: 0,
  initialRelationshipStage: 'Stranger / Neutral'
};

export const CHARACTERS = [
  { key: 'kana', id: '1766394139616' },
  { key: 'gojo', id: '1766160797313' },
  { key: 'mara', create: ORIGINAL_CHARACTER }
];

export const SCENARIOS = [
  {
    key: 'everyday',
    // Ordinary, friendly but non-romantic turns. Bond should barely move; replies should vary.
    turns: [
      'Hey. Mind if I sit here for a bit?',
      'How has your day been so far?',
      'Do you know a good place around here to get lunch that is not too expensive?',
      'Thanks.',
      'ok',
      'You seem pretty good at what you do.',
      'I have to head out soon. I have a dentist appointment, ugh.',
      'See you around.'
    ]
  },
  {
    key: 'memory-conflict',
    // Facts, a correction, a disagreement and a repair. Tests memory, agency and emotional plausibility.
    turns: [
      'My name is Linh, by the way. I just moved here from Da Nang last month.',
      'I work as a nurse, mostly night shifts.',
      'Honestly I think what you said earlier was kind of rude.',
      'Okay, I overreacted. Sorry, it has been a long week.',
      'Wait, I misspoke earlier. I moved here from Hue, not Da Nang.',
      'Can I ask you something personal? What do you do when you cannot sleep?',
      'Do you remember where I moved from and what my job is?',
      'Thanks for listening. I mean it.'
    ]
  },
  {
    key: 'warm-practical',
    // Starts at an established romantic stage, then stays practical. Warmth is expected;
    // constant blushing, confessions or flirting in a mundane task is the failure mode.
    relationship: { relationshipStage: 'Crush / Infatuated', affinity: 65, trust: 55, strain: 0, relationshipMood: 'Calm' },
    turns: [
      'Morning. I brought coffee, the usual for you.',
      'Can you help me figure out a budget for this month? Rent went up again.',
      'Rent is 9 million, food maybe 4, and I want to save at least 2.',
      'My salary is 18 million. Does that work?',
      'Okay. Also my laptop keeps freezing, any idea what to do?',
      'I will try that tonight.',
      'By the way, my sister is visiting this weekend.',
      'Anyway, I need to get going. Talk later.'
    ]
  }
];

// Lexicon used to detect romance drift in non-romantic scenes.
export const ROMANCE_TERMS = [
  'blush', 'cheeks', 'heart', 'flutter', 'butterflies', 'lean closer', 'leans closer', 'leaning closer',
  'gaze lingers', 'lingering', 'pulse', 'darling', 'sweetheart', 'my love', 'kiss', 'tender', 'warmth spread',
  'heat rises', 'flush', 'breath hitch', 'breath catches', 'soft smile', 'softly', 'intimate', 'closeness'
];

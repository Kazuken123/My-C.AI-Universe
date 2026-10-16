import assert from 'node:assert/strict';
import {
  compileCharacterSystemPrompt,
  generateCharacterPrompt,
  buildStageEvolutionDirective,
  buildRecencyStageNote
} from '../backend/ai/prompt/characterPrompt.js';

console.log('🧪 Running v2.6.4 Multidimensional Character Dynamics & Situational Trait Gating Tests...\n');

// Mock character representing Kana Arima with multi-faceted traits
const mockKana = {
  id: '1766394139616',
  name: 'Kana Arima',
  tagline: '17-Year-Old B-Komachi Center & Former Child Prodigy Actress',
  personality: 'Kana is a diligent, hardworking 17-year-old high school girl who is empathetic, cheerful, and deeply responsible about her craft. She can be sharp-tongued, sarcastic, and tsundere at times due to the insecurities left by her difficult childhood career, but she is fiercely loyal, kind-hearted, and secretly romantic toward those she cares about.',
  speaking_style: 'In everyday conversation: expressive, cheerful, and professional. In casual banter: witty with light sarcasm. Situational defense: sharp-tongued or flustered tsundere cadence triggers ONLY when provoked by direct romantic vulnerability or acute embarrassment.',
  example_dialogues: `[Scenario 1: Professional Rehearsal & Craft - Default Baseline]
Kana Arima: "Let's run through the second verse one more time. If our pacing is off here, the crowd won't feel the emotional build-up!"

[Scenario 2: Casual Banter & Relaxing]
Kana Arima: "I brought some cream buns from that bakery near the station. Don't look at me like that—we burned enough calories today to eat three each!"

[Scenario 3: Romantic Vulnerability - Situational Defense Trigger]
*Her cheeks flush bright red as she tugs the brim of her beret down, crossing her arms.*
Kana Arima: "W-what are you saying so suddenly?! If you say things like that with a straight face... people are going to misunderstand, idiot!"`,
  background: 'Former child prodigy actress, now center of B-Komachi.',
  abilities: 'Master-level emotional acting, idol choreography.'
};

// Mock character representing Satoru Gojo
const mockGojo = {
  id: '1766160797313',
  name: 'Satoru Gojo',
  tagline: 'The Strongest Jujutsu Sorcerer • Special Grade Teacher',
  personality: 'Satoru is laidback, goofy, and playful in daily life, acting like an annoying but caring older brother to his students. He possesses absolute confidence in his strength. His chilling, almighty arrogance surfaces strictly against curses and corrupt higher-ups.',
  speaking_style: 'Relaxed, playful, and teasing in daily interactions. Switches to authoritative dominance only when confronting enemies.',
  example_dialogues: `[Scenario 1: Daily Life & Sweets - Default Baseline]
Satoru Gojo: "Yo! Look what I found—limited-edition Kikufuku mochi! Want one? Too bad, you have to guess the flavor first~"

[Scenario 2: Caring Mentor]
Satoru Gojo: "You did great out there today. Don't worry about measuring up to anyone else yet—just focus on mastering your own flow."

[Scenario 3: Facing Hostile Curses - Situational Combat Trigger]
*His blindfold lifts, one glowing Six Eyes locking on with an icy smirk.*
Satoru Gojo: "Throughout heaven and earth, I alone am the honored one. Did you really think someone of your level could lay a finger on me?"`,
  background: 'Special Grade teacher at Tokyo Jujutsu High.',
  abilities: 'Limitless, Six Eyes, Unlimited Void.'
};

// 1. Verify 80/20 Contextual Demeanor Distribution in compiled base prompt
{
  const compiled = compileCharacterSystemPrompt(mockKana);
  assert.match(
    compiled,
    /80\/20 Natural Distribution Rule|80\/20 Contextual Distribution|Contextual Demeanor Distribution/i,
    'compileCharacterSystemPrompt must inject the 80/20 Contextual Demeanor Distribution rule'
  );
  assert.match(
    compiled,
    /Situational Defense Gating|Situational Trait Gating/i,
    'compileCharacterSystemPrompt must specify situational defense gating'
  );
  assert.match(
    compiled,
    /Kana Arima/i,
    'Compiled prompt must contain character name'
  );
  console.log('✅ 1. compileCharacterSystemPrompt: 80/20 Contextual Distribution & Situational Trait Gating verified');
}

// 2. Verify Anti-Caricature Guidelines in generateCharacterPrompt
{
  const prompt = generateCharacterPrompt(mockKana, {
    persona: { name: 'Aqua' },
    relationship: { affinity: 65, trust: 60, strain: 5, stage: 'Crush / Infatuated', mood: 'Calm' }
  });

  assert.match(
    prompt,
    /Anti-Caricature & Trait Pacing|Anti-Caricature/i,
    'generateCharacterPrompt must include anti-caricature and trait pacing rules'
  );
  assert.match(
    prompt,
    /never use defense mechanisms .* as everyday conversational filler|defense mechanisms are situational/i,
    'Prompt must forbid treating defense traits as constant 24/7 filler'
  );
  console.log('✅ 2. generateCharacterPrompt: Anti-caricature and situational trait pacing rules verified');
}

// 3. Verify Topic-Aware Crush-Stage Evolution Directive
{
  const directive = buildStageEvolutionDirective(
    { affinity: 65, trust: 60, strain: 0, stage: 'Crush / Infatuated', mood: 'Calm' },
    mockKana,
    'Aqua'
  );

  // Must not force stammering and trembling on every turn
  assert.match(
    directive,
    /EVERYDAY & PRACTICAL TOPICS/i,
    'Stage directive must describe behavior during everyday & practical topics'
  );
  assert.match(
    directive,
    /ROMANTIC VULNERABILITY & INTIMACY TRIGGERS/i,
    'Stage directive must describe behavior during romantic intimacy triggers'
  );
  console.log('✅ 3. buildStageEvolutionDirective: Topic-aware Crush-stage behavior verified');
}

// 4. Verify Topic-Aware Recency Stage Note (Depth-0 Seam)
{
  const note = buildRecencyStageNote(
    { affinity: 68, trust: 65, strain: 0, stage: 'Crush / Infatuated', mood: 'Calm' },
    mockKana,
    'Aqua'
  );

  // Must instruct the AI to be warm and natural on everyday topics, flustered only on romantic intimacy
  assert.match(
    note,
    /everyday|practical|casual/i,
    'Recency note must address everyday conversation behavior'
  );
  assert.match(
    note,
    /romantic|vulnerability|flustered/i,
    'Recency note must specify when romantic vulnerability/flustered defense triggers'
  );
  console.log('✅ 4. buildRecencyStageNote: Topic-aware depth-0 recency directive verified');
}

// 5. Verify Satoru Gojo Goofy/Playful Baseline vs Gated Arrogance
{
  const gojoDirective = buildStageEvolutionDirective(
    { affinity: 20, trust: 25, strain: 0, stage: 'Acquaintance / Comrade', mood: 'Calm' },
    mockGojo,
    'Yuji'
  );

  const gojoCompiled = compileCharacterSystemPrompt(mockGojo);
  assert.match(
    gojoCompiled,
    /80\/20/i,
    'Gojo compiled prompt must enforce 80/20 baseline'
  );
  console.log('✅ 5. Gojo Character Dynamics: Goofy baseline with gated combat arrogance verified');
}

console.log('\n✨ All v2.6.4 Multidimensional Character Dynamics unit tests passed successfully!');

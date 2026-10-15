import assert from 'node:assert/strict';
import { relationshipService } from '../backend/services/relationship.service.js';
import { generateCharacterPrompt } from '../backend/ai/prompt/characterPrompt.js';
import { Character } from '../backend/models/Character.js';
import { ChatSession } from '../backend/models/ChatSession.js';

console.log('🧪 Running v2.6.0 Psychological Relationship & Closeness Engine Tests...\n');

// =========================================================================
// Test 1: Character Model & Initial Relationship Seeding
// =========================================================================
const mockCharData = {
  id: 'char_kana_test',
  name: 'Kana Arima',
  tagline: 'Child prodigy actress',
  personality: 'Sharp-tongued, proud, tsundere externally, loyal and caring internally.',
  systemPrompt: 'You are Kana Arima.',
  initial_affinity: 65,
  initial_relationship_stage: 'Crush / Infatuated',
  relationship_dynamic: 'Secretly infatuated but masks vulnerability behind flustered sarcasm'
};

const character = new Character(mockCharData);
assert.equal(character.initial_affinity, 65, 'Character initial_affinity must be 65');
assert.equal(character.initial_relationship_stage, 'Crush / Infatuated', 'Character stage must be Crush / Infatuated');
assert.equal(character.relationship_dynamic, 'Secretly infatuated but masks vulnerability behind flustered sarcasm');

const newSession = new ChatSession({
  id: 'sess_test_1',
  characterId: character.id,
  personaId: 'persona_default',
  provider: 'gemini',
  affinity: character.initial_affinity,
  trust: character.initial_affinity,
  strain: 0,
  relationshipStage: character.initial_relationship_stage,
  relationshipMood: 'Calm'
});

assert.equal(newSession.affinity, 65, 'Session must seed affinity from character');
assert.equal(newSession.trust, 65, 'Session must seed trust from character');
assert.equal(newSession.strain, 0, 'New session starts with 0 conflict strain');
assert.equal(newSession.relationshipStage, 'Crush / Infatuated', 'Session stage matches initial stage');
console.log('✅ 1. Initial Relationship Seeding: Character config properly initializes new ChatSession state');

// =========================================================================
// Test 2: Lovers\' Quarrel Inertia (High Bond Protection)
// =========================================================================
const devotedSession = new ChatSession({
  id: 'sess_devoted',
  characterId: character.id,
  affinity: 80,
  trust: 75,
  strain: 10,
  relationshipStage: 'Deep Love / Devoted',
  relationshipMood: 'Warm'
});

const quarrelResult = relationshipService.evaluateTurn({
  userText: 'Why did you keep this from me?! You always make decisions without asking me!',
  aiText: '*turns her face away, tears welling in her eyes* Because I was terrified of losing you, idiot! Why is that so hard for you to understand?!',
  session: devotedSession,
  character
});

assert.ok(quarrelResult.affinity >= 78, `Affinity (${quarrelResult.affinity}) must retain emotional inertia and remain >= 78`);
assert.ok(quarrelResult.strain > devotedSession.strain, `Strain (${quarrelResult.strain}) must increase during a heated dispute`);
assert.ok(
  quarrelResult.relationshipMood.includes('Quarreling') || quarrelResult.relationshipMood.includes('Hurt'),
  `Immediate mood (${quarrelResult.relationshipMood}) must reflect tension`
);
assert.equal(quarrelResult.relationshipStage, 'Deep Love / Devoted', 'Relationship stage must NOT immediately drop during an isolated couple quarrel');
console.log('✅ 2. Lovers\' Quarrel Inertia: High affinity protected by inertia while strain accumulates');

// =========================================================================
// Test 3: Chronic Toxicity & Breaking Point (Dam Breaks)
// =========================================================================
const strainedSession = new ChatSession({
  id: 'sess_strained',
  characterId: character.id,
  affinity: 60,
  trust: 50,
  strain: 68, // Above breaking threshold of 65
  relationshipStage: 'Crush / Infatuated',
  relationshipMood: 'Hurt / Heartbroken'
});

const toxicTurnResult = relationshipService.evaluateTurn({
  userText: 'You are completely pathetic, worthless, and I regret ever caring about you.',
  aiText: '*drops her gaze, trembling as her voice goes hollow* Fine. If that is what you truly think... we are done.',
  session: strainedSession,
  character
});

assert.ok(toxicTurnResult.affinity < strainedSession.affinity, 'Affinity must suffer structural penalty past strain >= 65');
assert.ok(toxicTurnResult.trust < strainedSession.trust, 'Trust must break down significantly');
assert.ok(toxicTurnResult.strain >= 70, 'Strain continues to stay critically high');
console.log('✅ 3. Breaking Point Dynamics: Chronic toxicity with strain >= 65 breaches emotional dam');

// =========================================================================
// Test 4: Sincere Apology & Relationship Repair
// =========================================================================
const postFightSession = new ChatSession({
  id: 'sess_post_fight',
  characterId: character.id,
  affinity: 78,
  trust: 70,
  strain: 45,
  relationshipStage: 'Deep Love / Devoted',
  relationshipMood: 'Quarreling / Heated'
});

const apologyResult = relationshipService.evaluateTurn({
  userText: 'I am so sorry, Kana. I was angry and I spoke carelessly. I never meant to hurt you.',
  aiText: '*looks down, wiping her eyes before letting out a soft, shaky breath* You really are an idiot... But thank you for apologizing. Just do not do that again.',
  session: postFightSession,
  character
});

assert.ok(apologyResult.strain < postFightSession.strain, `Strain (${apologyResult.strain}) must decrease after sincere apology`);
assert.ok(apologyResult.affinity >= postFightSession.affinity, 'Affinity should recover or slightly strengthen from repair');
assert.ok(
  apologyResult.relationshipMood === 'Calm' || apologyResult.relationshipMood === 'Warm',
  `Mood (${apologyResult.relationshipMood}) should calm after forgiveness`
);
console.log('✅ 4. Apology & Repair: Sincere reconciliation discharges conflict strain');

// =========================================================================
// Test 5: Dynamic Character Prompt Relationship Block Injection
// =========================================================================
const testPrompt = generateCharacterPrompt(character, {
  persona: { name: 'Aqua' },
  relationship: {
    affinity: 82,
    trust: 78,
    strain: 15,
    relationshipStage: 'Deep Love / Devoted',
    relationshipMood: 'Warm'
  }
});

assert.ok(testPrompt.includes('[RELATIONSHIP & EMOTIONAL DYNAMICS WITH USER]'), 'System prompt must include relationship dynamics block');
assert.ok(testPrompt.includes('Deep Love / Devoted'), 'System prompt must reflect active relationship stage');
assert.ok(testPrompt.includes('+82/100'), 'System prompt must state affinity score');
assert.ok(testPrompt.includes('Warm'), 'System prompt must state active mood');
assert.ok(testPrompt.includes('Secretly infatuated but masks vulnerability behind flustered sarcasm'), 'System prompt must include author dynamic');
assert.ok(testPrompt.includes('High Emotional Inertia (Dual-Layer Realism)'), 'System prompt must enforce dual-layer realism');
assert.ok(testPrompt.includes('Anti-Contradiction / Psychological Permanence'), 'System prompt must enforce anti-contradiction');
console.log('✅ 5. System Prompt Injection: Relationship & emotional dynamics block fully formatted and injected');

// =========================================================================
// Test 6: Persona Vulnerability & Stage Resolution
// =========================================================================
const tsundereChar = {
  personality: 'Tsundere externally, soft inside'
};
const yandereChar = {
  personality: 'Possessive yandere who refuses to let anyone come between them'
};

const tsundereStage = relationshipService.resolveStage(65, tsundereChar);
const yandereStage = relationshipService.resolveStage(95, yandereChar);
const nemesisStage = relationshipService.resolveStage(-85, character);

assert.equal(tsundereStage, 'Crush / Infatuated', 'Affinity 65 maps to Crush / Infatuated');
assert.equal(yandereStage, 'Obsessed / Possessive', 'Affinity 95 with yandere traits maps to Obsessed / Possessive');
assert.equal(nemesisStage, 'Hatred / Nemesis', 'Affinity -85 maps to Hatred / Nemesis');
console.log('✅ 6. Persona Adaptation & Stage Resolution: Stages correctly adapt to affinity and traits');

console.log('\n✨ All v2.6.0 Psychological Relationship Engine unit tests passed successfully!');

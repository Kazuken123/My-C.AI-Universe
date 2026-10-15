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

// =========================================================================
// Test 7: Negation-Aware Signal Detection (Anti-False-Positive Guard)
// =========================================================================
// Case 7a: Cold rejection with negation ("don't love you") must NOT trigger isAffectionate
const devotedPair = new ChatSession({
  id: 'sess_pair',
  characterId: character.id,
  affinity: 75,
  trust: 70,
  strain: 10,
  relationshipStage: 'Deep Love / Devoted',
  relationshipMood: 'Warm'
});

const rejectionResult = relationshipService.evaluateTurn({
  userText: "I don't love you anymore. We are done.",
  aiText: '*freezes in place, staring at you in utter disbelief as her breath catches* What... what did you just say?',
  session: devotedPair,
  character
});

assert.ok(rejectionResult.affinity < devotedPair.affinity, 'Affinity must decrease on cold rejection');
assert.equal(rejectionResult.relationshipMood, 'Hurt / Heartbroken', 'Cold rejection must produce Hurt / Heartbroken mood, not Warm');
assert.ok(rejectionResult.strain > devotedPair.strain, 'Cold rejection must increase conflict strain');

// Case 7b: Reassurance ("You are not worthless") must NOT trigger isToxicOrCruel
const insecureSession = new ChatSession({
  id: 'sess_insecure',
  characterId: character.id,
  affinity: 50,
  trust: 50,
  strain: 30,
  relationshipStage: 'Close Friend / Confidant',
  relationshipMood: 'Guarded'
});

const reassuranceResult = relationshipService.evaluateTurn({
  userText: "You are not worthless, Kana. Don't blame yourself for what happened.",
  aiText: '*blinks back tears and looks away, her shoulders relaxing slightly* You... you really mean that?',
  session: insecureSession,
  character
});

assert.ok(reassuranceResult.strain < insecureSession.strain, 'Reassurance must decrease strain');
assert.ok(reassuranceResult.trust > insecureSession.trust, 'Reassurance must increase trust');
assert.ok(reassuranceResult.affinity >= insecureSession.affinity, 'Reassurance must not penalize affinity');
assert.equal(reassuranceResult.relationshipMood, 'Warm', 'Reassurance should bring Warm mood');
console.log('✅ 7. Negation Guard: Negated affection and negated toxicity correctly distinguished');

// =========================================================================
// Test 8: Bidirectional Negative Inertia (Nemesis Suspicion)
// =========================================================================
const nemesisSession = new ChatSession({
  id: 'sess_nemesis',
  characterId: character.id,
  affinity: -85,
  trust: -80,
  strain: 40,
  relationshipStage: 'Hatred / Nemesis',
  relationshipMood: 'Hostile / Bitter'
});

const sweetWordsToNemesisResult = relationshipService.evaluateTurn({
  userText: 'I love you so much, please forgive me!',
  aiText: '*narrows her eyes with deep skepticism and grips her weapon tighter* What sick game are you playing now?',
  session: nemesisSession,
  character
});

assert.equal(sweetWordsToNemesisResult.relationshipMood, 'Suspicious / Guarded', 'Nemesis must react with Suspicious / Guarded to sudden flattery');
assert.ok(sweetWordsToNemesisResult.affinity <= -80, 'Affinity must not jump dramatically from a single turn');
assert.equal(sweetWordsToNemesisResult.relationshipStage, 'Hatred / Nemesis', 'Stage must remain Hatred / Nemesis');
console.log('✅ 8. Negative Inertia: Enemies remain guarded against sudden flattery');

// =========================================================================
// Test 9: AI-Driven Reaction on Neutral & Continuation Turns
// =========================================================================
const neutralSession = new ChatSession({
  id: 'sess_neutral',
  characterId: character.id,
  affinity: 10,
  trust: 10,
  strain: 10,
  relationshipStage: 'Stranger / Neutral',
  relationshipMood: 'Calm'
});

const fearReactionResult = relationshipService.evaluateTurn({
  userText: '*steps forward in the dark hallway silently without speaking*',
  aiText: '*steps back in terror, trembling violently as her voice shaking calls out into the shadows* Who is there?!',
  session: neutralSession,
  character
});

assert.equal(fearReactionResult.relationshipMood, 'Afraid', 'AI expressing terror must shift mood to Afraid');
assert.ok(fearReactionResult.strain > neutralSession.strain, 'Terror reaction increases strain');

const warmthReactionResult = relationshipService.evaluateTurn({
  userText: '*hands her a hot can of coffee from the vending machine*',
  aiText: '*smiles warmly as she takes the can, her eyes soften* Thank you... this helps a lot.',
  session: neutralSession,
  character
});

assert.equal(warmthReactionResult.relationshipMood, 'Warm', 'AI expressing gentle warmth shifts mood to Warm');
assert.ok(warmthReactionResult.strain <= neutralSession.strain, 'Warmth cools down or maintains low strain');
console.log('✅ 9. AI-Driven Subtle Reactions: Emotional weather responds accurately to AI body language');

console.log('\n✨ All v2.6.1 Psychological Relationship Engine unit tests passed successfully!');

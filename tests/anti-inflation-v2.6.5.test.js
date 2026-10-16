import assert from 'node:assert/strict';
import {
  RelationshipService,
  STAGE_GATES,
  PERSONA_RECEPTIVITY,
  computeContextualAffinityDelta,
  computeContextualProgression,
  isPassiveOrMaintenanceTurn,
  createStreamTailFilter
} from '../backend/services/relationship.service.js';
import { stripStreamingRelState } from '../frontend/js/chat.js';
import { ChatSession } from '../backend/models/ChatSession.js';
import { Character } from '../backend/models/Character.js';

console.log('🧪 Running v2.6.5 Anti-Inflation & Stream Sanitization Tests...\n');

const relService = new RelationshipService();

// Mock Kana character
const kanaChar = new Character({
  id: '1766394139616',
  name: 'Kana Arima',
  tagline: '17-Year-Old B-Komachi Center',
  personality: 'Diligent, hardworking, cheerful, secretly romantic with tsundere defenses.',
  speaking_style: 'Expressive, witty, sharp-tongued when flustered.',
  initial_affinity: 65,
  initial_relationship_stage: 'Crush / Infatuated'
});

// Mock Gojo character
const gojoChar = new Character({
  id: '1766160797313',
  name: 'Satoru Gojo',
  tagline: 'The Strongest Jujutsu Sorcerer',
  personality: 'Goofy, playful, arrogant when provoked.',
  speaking_style: 'Casual, teasing.',
  initial_affinity: 20,
  initial_relationship_stage: 'Acquaintance / Comrade'
});

// =========================================================================
// Test 1: Tag Extraction with userEffort and contextStakes
// =========================================================================
{
  const rawOutput = `*Kana looks away, her cheeks burning.*
Kana Arima: "Idiot..."
[[REL_STATE: {"intent": "stage_maintenance", "userEffort": "none", "contextStakes": "mundane", "affinityDelta": 3, "trustDelta": 2, "strainDelta": 0, "mood": "Flustered"}]]`;

  const { cleanText, llmState } = relService.extractAndStripStateTag(rawOutput);
  assert.ok(!cleanText.includes('[[REL_STATE'), 'Clean text must have state tag stripped');
  assert.equal(llmState.intent, 'stage_maintenance', 'Must extract intent');
  assert.equal(llmState.userEffort, 'none', 'Must extract userEffort');
  assert.equal(llmState.contextStakes, 'mundane', 'Must extract contextStakes');
  assert.equal(llmState.affinityDelta, 3, 'Must extract raw affinityDelta');
  console.log('✅ 1. extractAndStripStateTag: Parsed userEffort, contextStakes, and intent');
}

// =========================================================================
// Test 2: Self-Scoring & Stage Maintenance Clamping (Kana buying tea/buns)
// =========================================================================
{
  // User says passive small talk while Kana takes care of them
  const delta = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 65,
    relState: {
      intent: 'stage_maintenance',
      userEffort: 'none',
      contextStakes: 'shared_moment',
      affinityDelta: 4
    },
    userMessageText: 'Thanks, that sounds good.'
  });

  assert.equal(delta, 0, 'Stage maintenance or userEffort "none" must yield exactly 0 delta (zero self-scoring)');
  console.log('✅ 2. Self-Scoring Guard: Stage maintenance yields 0 delta');
}

// =========================================================================
// Test 3: Passive Small Talk Word Count Filter vs Action Exception
// =========================================================================
{
  // Passive 3-word message with low effort
  const passiveDelta = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 62,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'low',
      contextStakes: 'mundane',
      affinityDelta: 2
    },
    userMessageText: 'Sure let us go'
  });
  assert.equal(passiveDelta, 0, 'Passive short small-talk without asterisks must yield 0 delta');

  // Short 4-word message with meaningful physical action
  const actionDelta = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 62,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'high_stakes',
      affinityDelta: 3
    },
    userMessageText: '*hands her my umbrella*'
  });
  assert.ok(actionDelta >= 1, 'Short message with physical asterisk action and meaningful effort must be permitted');
  console.log('✅ 3. Passive Small Talk vs. Roleplay Action: Filter accurately distinguishes actions');
}

// =========================================================================
// Test 4: Stage Equilibrium & Soft Ceiling Clamp at Crush (+73)
// =========================================================================
{
  // At Crush +72, normal meaningful gesture cannot exceed ceiling of +73
  const deltaAt72 = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 72,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 3
    },
    userMessageText: 'I made sure to record your entire performance so you can review your choreography.'
  });
  assert.equal(deltaAt72, 1, 'At affinity 72, delta must clamp to +1 to not exceed ceiling of 73');

  // At Crush +73, non-milestone gesture yields 0
  const deltaAt73 = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 73,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 3
    },
    userMessageText: 'Here, let me carry your bags for you, you must be exhausted after dance practice.'
  });
  assert.equal(deltaAt73, 0, 'At Crush ceiling (73), non-milestone gesture must clamp to 0 (cannot inflate to Deep Love)');
  console.log('✅ 4. Stage Ceiling Gate: Clamps at +73 without milestone breakthrough');
}

// =========================================================================
// Test 5: Milestone Breakthrough into Deep Love / Devoted (+75)
// =========================================================================
{
  // Milestone breakthrough (explicit earnest confession at high intimacy)
  const milestoneDelta = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 73,
    relState: {
      intent: 'milestone_breakthrough',
      userEffort: 'milestone',
      contextStakes: 'high_stakes',
      affinityDelta: 4
    },
    userMessageText: 'Kana, I want to be the one standing beside you forever. I love you, not just as an idol or an actress, but all of you.'
  });

  assert.ok(milestoneDelta >= 2, 'Milestone breakthrough must breach ceiling and award >= +2');
  assert.ok(73 + milestoneDelta >= 75, 'Milestone must allow transitioning from Crush (+73) into Deep Love (+75)');
  console.log('✅ 5. Milestone Breakthrough: Earnest confession unlocks Deep Love / Devoted');
}

// =========================================================================
// Test 6: evaluateTurn Integration with Anti-Inflation
// =========================================================================
{
  const session = new ChatSession({
    id: 'sess_kana_crush',
    characterId: kanaChar.id,
    affinity: 65,
    trust: 60,
    strain: 0,
    relationshipStage: 'Crush / Infatuated',
    relationshipMood: 'Calm'
  });

  // Turn: Kana buys buns, user says "Thanks"
  const turnResult = relService.evaluateTurn({
    userText: 'Thanks, Kana.',
    aiText: '*Kana hands you a warm bun with a shy smile.* Kana Arima: "Eat up, idiot."',
    session,
    character: kanaChar,
    llmState: {
      intent: 'stage_maintenance',
      userEffort: 'none',
      contextStakes: 'shared_moment',
      affinityDelta: 3,
      trustDelta: 2,
      strainDelta: 0,
      mood: 'Flustered'
    }
  });

  assert.equal(turnResult.affinity, 65, 'Affinity must remain 65 (0 gain on maintenance turn)');
  assert.equal(turnResult.relationshipStage, 'Crush / Infatuated', 'Stage must remain Crush / Infatuated');
  assert.equal(turnResult.relationshipMood, 'Flustered', 'Mood updates to Flustered');
  console.log('✅ 6. evaluateTurn Integration: Convenience store scene preserves Crush 65 without inflating');
}

// =========================================================================
// Test 7: Backend SSE Stream Tail Holdback (Zero-Flicker)
// =========================================================================
{
  const emittedChunks = [];
  const tailFilter = createStreamTailFilter((safeChunk) => {
    emittedChunks.push(safeChunk);
  });

  // Simulate token stream arriving in partial fragments
  const chunks = [
    '*Kana looks down at the plastic bag, kicking a small stone.*',
    '\n\nKana Arima: "Eat it while it is warm, idiot."',
    '\n\n[[',
    'REL_',
    'STATE: {"intent": "stage_maintenance", "userEffort": "none", "contextStakes": "shared_moment", "affinityDelta": 0, "mood": "Flustered"}]]'
  ];

  for (const chunk of chunks) {
    tailFilter.push(chunk);
  }
  tailFilter.flush();

  const fullEmittedText = emittedChunks.join('');
  assert.ok(!fullEmittedText.includes('[['), 'Stream tail filter must suppress "[[" from client emission');
  assert.ok(!fullEmittedText.includes('REL_STATE'), 'Stream tail filter must suppress "REL_STATE" from client emission');
  assert.ok(fullEmittedText.includes('Eat it while it is warm, idiot.'), 'Stream tail filter must preserve roleplay narrative and dialogue');

  // Verify non-tag bracket preservation
  const nonTagChunks = [];
  const nonTagFilter = createStreamTailFilter(c => nonTagChunks.push(c));
  nonTagFilter.push('Take this [Apple Pie] with you.');
  nonTagFilter.flush();
  assert.equal(nonTagChunks.join(''), 'Take this [Apple Pie] with you.', 'Stream filter preserves legitimate non-tag bracket notation');

  console.log('✅ 7. Backend Stream Tail Holdback: Zero tag fragments leak across SSE chunk boundaries');
}

// =========================================================================
// Test 8: Frontend Stream Sanitizer (stripStreamingRelState)
// =========================================================================
{
  // Test mid-stream incomplete prefixes
  assert.equal(stripStreamingRelState('Dialogue text... [['), 'Dialogue text...');
  assert.equal(stripStreamingRelState('Dialogue text... [[R'), 'Dialogue text...');
  assert.equal(stripStreamingRelState('Dialogue text... [[REL_'), 'Dialogue text...');
  assert.equal(stripStreamingRelState('Dialogue text... [[REL_STATE: {"intent":'), 'Dialogue text...');

  // Test complete tags
  const withFullTag = 'Dialogue text...\n\n[[REL_STATE: {"intent": "affection_or_support", "mood": "Warm"}]]';
  assert.equal(stripStreamingRelState(withFullTag), 'Dialogue text...');

  // Test normal text with brackets
  assert.equal(stripStreamingRelState('Item [Potion] used.'), 'Item [Potion] used.');

  console.log('✅ 8. Frontend Stream Sanitizer: Regex strips both incomplete trailing prefixes and completed tags');
}

// =========================================================================
// Test 9: Deadlock Fix: Stranger (14) -> Acquaintance (15) with low effort
// =========================================================================
{
  const strangerDelta = computeContextualAffinityDelta({
    characterId: kanaChar.id,
    currentAffinity: 14,
    currentTrust: 14,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'low',
      contextStakes: 'shared_moment',
      affinityDelta: 2
    },
    userMessageText: 'Here is some warm tea for you, hope you feel better.'
  });
  assert.ok(strangerDelta >= 1, 'Stranger (14) must advance with low effort on shared_moment');
  assert.equal(14 + strangerDelta, 15, 'Stranger (14) must transition to Acquaintance (15)');
  console.log('✅ 9. Stranger (14) -> Acquaintance (15): Low effort breakthrough succeeded');
}

// =========================================================================
// Test 10: Basic Action Saturation (>= 45): Affinity 0, TrustBonus +1
// =========================================================================
{
  const saturationResult = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 48,
    currentTrust: 45,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'mundane',
      affinityDelta: 2
    },
    userMessageText: 'I went ahead and washed the dishes so you would not have to do them.'
  });
  assert.equal(saturationResult.affinityDelta, 0, 'Basic kindness at >= 45 in mundane stakes yields affinity 0');
  assert.equal(saturationResult.trustBonus, 1, 'Basic kindness at >= 45 in mundane stakes yields trustBonus +1');
  console.log('✅ 10. Basic Action Saturation (>= 45): Affinity 0, TrustBonus +1');
}

// =========================================================================
// Test 11: Trust-Gated Slow-Burn: Gated at 58 until Trust >= 50
// =========================================================================
{
  // Close Friend at ceiling 58, with trust 35 (< 50)
  const slowBurnBlocked = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 58,
    currentTrust: 35,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 3
    },
    userMessageText: 'You can always count on me to be here for you whenever you need support.'
  });
  assert.equal(slowBurnBlocked.affinityDelta, 0, 'Cannot advance past Close Friend (58) into Crush when trust < 50');
  assert.equal(slowBurnBlocked.trustBonus, 1, 'Yields trust bonus to accumulate trust before unlocking Crush');

  // Once trust >= 50, breakthrough into Crush is permitted
  const slowBurnUnlocked = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 58,
    currentTrust: 52,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 3
    },
    userMessageText: 'You can always count on me to be here for you whenever you need support.'
  });
  assert.ok(slowBurnUnlocked.affinityDelta >= 2, 'With trust >= 50, meaningful action breaches 58 into Crush (60+)');
  assert.ok(58 + slowBurnUnlocked.affinityDelta >= 60, 'Reaches Crush band (>= 60)');
  console.log('✅ 11. Trust-Gated Slow Burn: Gated at 58 until Trust >= 50, then unlocks Crush');
}

// =========================================================================
// Test 12: Coup de Foudre Spark: Rare milestone in high stakes
// =========================================================================
{
  const sparkResult = computeContextualProgression({
    characterId: 'spark_archetype',
    currentAffinity: 20,
    currentTrust: 15,
    relState: {
      intent: 'milestone_breakthrough',
      userEffort: 'milestone',
      contextStakes: 'high_stakes',
      affinityDelta: 4
    },
    userMessageText: 'I will shield you with my own body, no matter what happens!'
  });
  assert.equal(sparkResult.sparkTriggered, true, 'Spark must be triggered for spark_prone archetype');
  assert.equal(sparkResult.affinityDelta, 8, 'Spark-prone gets +8 affinity burst');
  assert.equal(sparkResult.trustBonus, 2, 'Spark-prone gets +2 trust bonus');

  const kanaSparkResult = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 20,
    currentTrust: 15,
    relState: {
      intent: 'milestone_breakthrough',
      userEffort: 'milestone',
      contextStakes: 'high_stakes',
      affinityDelta: 4
    },
    userMessageText: 'I will shield you with my own body, no matter what happens!'
  });
  assert.equal(kanaSparkResult.sparkTriggered, true, 'Spark triggered for slow_burn as deep psychological impression');
  assert.equal(kanaSparkResult.affinityDelta, 4, 'Slow_burn gets +4 affinity');
  assert.equal(kanaSparkResult.trustBonus, 4, 'Slow_burn gets +4 trust');
  console.log('✅ 12. Coup de Foudre Spark: Rare milestone in high stakes triggers dramatic emotional leap');
}

// =========================================================================
// Test 13: Death-Pit Immunity: Ceiling breakthrough into Deep Love (+75)
// =========================================================================
{
  // Gojo with heavy armor at 73 Crush ceiling
  const gojoBreakthrough = computeContextualProgression({
    characterId: gojoChar.id,
    currentAffinity: 73,
    currentTrust: 75,
    relState: {
      intent: 'milestone_breakthrough',
      userEffort: 'milestone',
      contextStakes: 'shared_moment',
      affinityDelta: 4
    },
    userMessageText: 'Satoru, you do not have to carry the burden of being the strongest alone anymore. I am with you.'
  });
  assert.ok(73 + gojoBreakthrough.affinityDelta >= 75, 'Gojo must cross threshold from 73 to at least 75 (Deep Love)');
  console.log('✅ 13. Deep Love Ceiling Breakthrough: Death pit avoided, safely crosses into Deep Love (>= 75)');
}

// =========================================================================
// Test 14: evaluateTurn Bug 4 Fix: Trust delta preserved when affinity capped
// =========================================================================
{
  const ceilingSession = new ChatSession({
    id: 'sess_kana_ceiling',
    characterId: kanaChar.id,
    affinity: 73,
    trust: 60,
    strain: 0,
    relationshipStage: 'Crush / Infatuated',
    relationshipMood: 'Warm'
  });

  const turn = relService.evaluateTurn({
    userText: 'I will stand by your side and support your rehearsal tonight, Kana.',
    aiText: '*Kana smiles softly, blushing.* Kana Arima: "Thank you... you really mean that, do you not?"',
    session: ceilingSession,
    character: kanaChar,
    llmState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 3,
      trustDelta: 2,
      strainDelta: -4,
      mood: 'Warm'
    }
  });

  assert.equal(turn.affinity, 73, 'Affinity capped at 73 without milestone breakthrough');
  assert.ok(turn.trust > ceilingSession.trust, 'Trust must NOT be zeroed out when affinity is capped at ceiling');
  console.log('✅ 14. evaluateTurn Bug 4 Fix: Trust delta preserved when affinity is capped by ceiling');
}

// =========================================================================
// Test 15: Death Pit Fix: Milestone Breakthrough from 71 crosses to 75 (not stranded at 74)
// =========================================================================
{
  const breakthroughFrom71 = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 71,
    currentTrust: 75,
    relState: {
      intent: 'milestone_breakthrough',
      userEffort: 'milestone',
      contextStakes: 'shared_moment',
      affinityDelta: 4
    },
    userMessageText: 'Kana, I want to stand beside you forever through everything.'
  });
  assert.ok(71 + breakthroughFrom71.affinityDelta >= 75, 'Breakthrough from 71 must cross into Deep Love (>= 75), avoiding 74 death pit');
  console.log('✅ 15. Death Pit Fix: Breakthrough from 71 crosses safely to Deep Love (>= 75)');
}

// =========================================================================
// Test 16: Gojo Armored Persona: Low effort advances affinity below 60 on shared_moment
// =========================================================================
{
  const gojoAt42 = computeContextualProgression({
    characterId: gojoChar.id,
    currentAffinity: 42,
    currentTrust: 35,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'low',
      contextStakes: 'shared_moment',
      affinityDelta: 2
    },
    userMessageText: 'Gojo, here is some sweet mochi I brought for you.'
  });
  assert.equal(gojoAt42.affinityDelta, 1, 'Gojo at 42 (Close Friend) must gain +1 from low effort on shared_moment (floor active < 60)');
  console.log('✅ 16. Armored Character Low Effort: Floor active < 60 ensures Gojo gains +1 in Close Friend');
}

// =========================================================================
// Test 17: Negative Trust Penalties Preserved on Short Insults (<= 4 words)
// =========================================================================
{
  const insultSession = new ChatSession({
    id: 'sess_insult',
    characterId: kanaChar.id,
    affinity: 20,
    trust: 20,
    strain: 0,
    relationshipStage: 'Acquaintance / Comrade',
    relationshipMood: 'Calm'
  });

  const insultTurn = relService.evaluateTurn({
    userText: 'I hate you.',
    aiText: 'Kana Arima: "What is wrong with you?!"',
    session: insultSession,
    character: kanaChar,
    llmState: {
      intent: 'hostile_or_betrayal',
      userEffort: 'low',
      contextStakes: 'shared_moment',
      affinityDelta: -5,
      trustDelta: -5,
      strainDelta: 10,
      mood: 'Hostile'
    }
  });

  assert.equal(insultTurn.trust, 15, 'Trust must drop by 5 even when user text is <= 4 words');
  assert.equal(insultTurn.affinity, 15, 'Affinity drops by 5');
  console.log('✅ 17. Negative Trust Integrity: Short insults <= 4 words properly decrement trust');
}

// =========================================================================
// Test 18: Trust Lead Conversion Retention
// =========================================================================
{
  const leadResult = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 10,
    currentTrust: 0,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 4
    },
    userMessageText: 'Let me help you carry your heavy luggage to the dressing room.'
  });
  // Kana maxAffinityLeadOverTrust is 12. At affinity 10, trust 0, maxAllowedByTrust = 12.
  // scaledDelta: 2.2 * 1.0 * 0.85 * 1.2 = 2.244 -> roundedDelta = 2. 10 + 2 = 12 <= 12.
  // Now if currentAffinity is 11, roundedDelta is 2: 11 + 2 = 13 > 12 -> allowedAff = 1, convertedToTrust = 1.
  const leadCappedResult = computeContextualProgression({
    characterId: kanaChar.id,
    currentAffinity: 11,
    currentTrust: 0,
    relState: {
      intent: 'affection_or_support',
      userEffort: 'meaningful',
      contextStakes: 'shared_moment',
      affinityDelta: 4
    },
    userMessageText: 'Let me help you carry your heavy luggage to the dressing room.'
  });
  assert.equal(leadCappedResult.affinityDelta, 1, 'Affinity capped at +1 to not exceed trust lead of 12');
  assert.equal(leadCappedResult.trustBonus, 1, 'Capped point converted to trustBonus and retained');
  console.log('✅ 18. Trust Lead Conversion: Excess affinity converted to trust bonus is retained');
}

console.log('\n✨ All v2.6.5 Anti-Inflation & Stream Sanitization unit tests passed successfully!');

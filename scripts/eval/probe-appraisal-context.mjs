// Opt-in, offline regression probe for relationship context and mood advice.
// Run: node scripts/eval/probe-appraisal-context.mjs
// Uses original adult spouses and an injected appraisal; makes no model calls.
// Uses the same fixture that exposed the original context loss and mood mandate.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestEnvironment } from '../run-tests.js';

export async function probeAppraisalContext() {
  const directory = mkdtempSync(path.join(tmpdir(), 'cai-appraisal-probe-'));
  const inherited = { ...process.env };
  const originalFetch = globalThis.fetch;
  let networkAttempts = 0;
  try {
    Object.assign(process.env, createTestEnvironment(directory, inherited));
    globalThis.fetch = async () => {
      networkAttempts++;
      throw new Error('This offline probe must not access the network');
    };
    const [{ AppraisalService }, { relationshipService }, { textFingerprint }, { generateCharacterPrompt }] = await Promise.all([
      import('../../backend/services/appraisal.service.js'),
      import('../../backend/services/relationship.service.js'),
      import('../../backend/services/turn-state.js'),
      import('../../backend/ai/prompt/characterPrompt.js')
    ]);

    const userText = '*I give her our familiar good-morning kiss on the cheek.*';
    const persona = {
      name: 'Haru',
      description: 'Haru is 32 and is Liora\'s husband. They have been married for five years.'
    };
    const character = {
      id: 'offline-adult-spouse-fixture',
      name: 'Liora',
      personality: 'Proud but affectionate, with dry humor.',
      background: 'Liora is 31. She and Haru have been married for five years.',
      initial_memory: 'They exchange a familiar good-morning kiss before breakfast.'
    };
    const storySummary = 'Liora and Haru are married adults with an established morning routine.';
    const session = {
      provider: 'gemini', affinity: 80, trust: 80, strain: 0,
      relationshipStage: 'Deep Love / Devoted', relationshipMood: 'Warm',
      narrativeState: { recentActions: [textFingerprint(userText)] }
    };
    const injectedAppraisal = {
      intent: 'affection_or_support', userEffort: 'meaningful', contextStakes: 'shared_moment',
      evidence: userText, reason: 'A kiss', mood: 'Flustered', intensity: 0.9,
      affinityDelta: 2, trustDelta: 2, strainDelta: 0
    };
    let capturedPrompt = '';
    const service = new AppraisalService(async prompt => {
      capturedPrompt = prompt;
      return JSON.stringify(injectedAppraisal);
    });
    const appraisal = await service.appraise({
      character, session, userText, persona, storySummary, history: [], memories: []
    });
    const data = JSON.parse(capturedPrompt.slice(capturedPrompt.indexOf('DATA: ') + 6));
    const evaluated = relationshipService.evaluateAppraisal({ userText, session, character, appraisal });
    const prompt = generateCharacterPrompt(character, {
      persona, storySummary, appraisalManaged: true, appraisal,
      relationship: { ...evaluated, stage: evaluated.relationshipStage, mood: evaluated.relationshipMood }
    });
    const direction = prompt.match(/\[CONTEXTUAL EMOTIONAL CONTINUITY\][\s\S]*$/)?.[0];

    assert.equal(data.persona.description, persona.description);
    assert.equal(data.character.background, character.background);
    assert.equal(data.character.coreMemory, character.initial_memory);
    assert.equal(data.storySummary.content, storySummary);
    assert.equal(data.storySummary.source, 'fallible_story_summary');
    assert.ok(prompt.includes(persona.description));
    assert.ok(prompt.includes(storySummary));
    assert.equal(appraisal?.mood, 'Flustered');
    assert.equal(appraisal?.intensity, 0.9);
    assert.equal(evaluated.affinity, session.affinity);
    assert.equal(evaluated.trust, session.trust);
    assert.equal(evaluated.relationshipMood, 'Flustered');
    assert.ok(direction?.includes('is advisory'));
    assert.doesNotMatch(prompt, /Express Flustered at 0.9 intensity|IMMEDIATE MOOD TAKES PRECEDENCE/);
    assert.equal(networkAttempts, 0);

    return {
      kind: 'offline-context-regression-probe',
      limitation: 'Injected mood proves routing and acceptance only; it does not measure model behavior.',
      appraisalDataFields: Object.keys(data),
      appraisalCharacterFields: Object.keys(data.character),
      appraisalSeesMarriageFact: JSON.stringify(data).includes('married'),
      generatorSeesMarriageFact: prompt.includes(persona.description),
      acceptedMood: appraisal.mood,
      acceptedIntensity: appraisal.intensity,
      repeatedAction: {
        affinityDelta: evaluated.affinity - session.affinity,
        trustDelta: evaluated.trust - session.trust,
        mood: evaluated.relationshipMood
      },
      generationDirection: direction,
      networkAttempts
    };
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(inherited, key)) delete process.env[key];
    Object.assign(process.env, inherited);
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('cai-appraisal-probe-')) {
      throw new Error('Refusing cleanup outside the diagnostic temporary directory');
    }
    rmSync(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await probeAppraisalContext(), null, 2));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponseLabService } from '../backend/services/response-lab.service.js';

const alternatives = () => JSON.stringify({ alternatives: Array.from({ length: 5 }, (_, n) => ({ move: `Choice ${n}`,
  paragraphs: [
    { kind: 'narration', sentences: ['She sits beside the table.', 'Her attention stays on the conversation.'] },
    { kind: 'dialogue', content: `An invitation for possibility ${n}.` },
    { kind: 'narration', sentences: ['She pauses for a moment.', 'She leaves room for an answer.'] },
    { kind: 'dialogue', content: `A different opening for possibility ${n}.` }
  ] })) });
function harness({ provider, screening, timeout = 1000 } = {}) {
  let current = { id: 'trial', contextHash: 'scene', revision: 0, status: 'generating', message: 'Stay a minute.',
    context: { character: { id: 'kana', name: 'Kana' }, provider: 'gemini', persona: null, history: [], memories: [], setup: 'At home.', pinnedMessages: [] },
    prepared: { aiOptions: {}, evaluatedState: { relationshipStage: 'Deep Love / Devoted', relationshipMood: 'Calm' } },
    batches: [{ id: 'round-one', tournament: true, roundNumber: 1, candidates: [], feedback: null }] };
  const repo = { async reviewsForTournament() { return []; }, async mutate(id, owner, revision, change) {
    assert.equal(current.revision, revision); await change(current); current.revision++; return structuredClone(current);
  } };
  let calls = 0, checks = 0;
  const service = new ResponseLabService({ repo, generationTimeoutMs: timeout,
    providers: { gemini: { modelName: 'fixture', async generateReply(...args) { calls++; return provider ? provider(...args) : alternatives(); } } },
    screening: { async screen(input) { checks++; if (screening) return screening(input); throw Error('Reviewer unavailable'); } } });
  return { service, get: () => structuredClone(current), set: value => { current = value; }, calls: () => calls, checks: () => checks };
}

test('a first unevaluated set appears without depending on a second model request', async () => {
  const h = harness();
  await h.service.generate('owner', h.get());
  const trial = h.get(), batch = trial.batches[0];
  assert.equal(trial.status, 'ready');
  assert.equal(h.calls(), 1);
  assert.equal(h.checks(), 0);
  assert.equal(batch.candidates.length, 5);
  assert.equal(batch.screening.method, 'initial-joint');
  assert.equal(batch.feedback, null);
});

test('retry recovers already generated initial replies from the same trial without a new AI call', async () => {
  const h = harness();
  await h.service.generate('owner', h.get());
  const trial = h.get(), candidates = trial.batches[0].candidates;
  Object.assign(trial.batches[0], { candidates: [], screeningAttempts: [{ attempt: 1, status: 'screening-unavailable', candidates }] });
  trial.batches.push({ id: 'retry', tournament: true, candidates: [], feedback: null });
  trial.status = 'generating'; h.set(trial);
  await h.service.generate('owner', h.get());
  const result = h.get().batches.at(-1);
  assert.equal(h.calls(), 1, 'reuse avoids paying for another generation');
  assert.equal(h.checks(), 0);
  assert.deepEqual(result.candidates.map(c => [c.id, c.text]), candidates.map(c => [c.id, c.text]));
  assert.ok(result.candidates.every(c => c.originBatchId === 'round-one' && c.recoveredFromBatchId === 'round-one'));
  assert.equal(result.feedback, null);
  assert.equal(result.screening.reusedGeneratedSet, true);
});

test('a reviewed round keeps semantic screening mandatory; outages preserve the winner and explicit labels', async () => {
  const h = harness(); await h.service.generate('owner', h.get());
  const trial = h.get(), first = trial.batches[0], winner = first.candidates[0];
  first.feedback = { accepted: [winner.id], rejected: first.candidates.slice(1).map(c => c.id), favorite: null,
    noneFit: false, reviewedAt: new Date().toISOString() };
  const feedback = structuredClone(first.feedback);
  trial.batches.push({ id: 'next', tournament: true, candidates: [{ ...winner, carriedFromBatchId: first.id }], feedback: null });
  trial.status = 'generating'; h.set(trial);
  await h.service.generate('owner', h.get());
  const result = h.get();
  assert.equal(h.checks(), 1);
  assert.deepEqual(result.batches.at(-1).candidates.map(c => c.id), [winner.id]);
  assert.equal(result.batches.at(-1).screening.failure.stage, 'screening');
  assert.deepEqual(result.batches[0].feedback, feedback);
});

test('a hung provider is aborted, releases the round, and a late reply cannot publish over the failure', async () => {
  let signal, release;
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness({ timeout: 15, provider: async (_character, _message, _history, options) => { signal = options.signal; return pending; } });
  await h.service.generate('owner', h.get());
  const result = h.get();
  assert.equal(signal.aborted, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.batches[0].screening.failure.code, 'timeout');
  assert.equal(result.batches[0].candidates.length, 0);
  release(alternatives()); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.get(), result);
});

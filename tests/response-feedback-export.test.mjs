import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEvaluations } from '../scripts/eval/export-response-lab.mjs';

const reply = (id, text = id) => ({ id, text, status: 'complete' });
const review = (accepted, rejected, reviewedAt = '2026-11-02T10:00:00.000Z') => ({ accepted, rejected,
  favorite: null, noneFit: accepted.length === 0, reviewedAt });
const trial = (id, batches, contextHash = 'scene') => ({ id, labId: 'lab', contextHash, createdAt: '2026-11-02T09:00:00.000Z',
  message: 'Prompt', context: { setup: 'Scene', character: { name: 'Kana' } }, batches });
const raw = trials => ({ exportedAt: '2026-11-02T11:00:00.000Z', labs: [{ id: 'lab' }], trials });

test('carried winners count once; latest explicit elimination wins, while unreviewed carryover adds no votes', () => {
  const a = reply('a'), b = reply('b'), c = reply('c');
  const result = extractEvaluations(raw([trial('one', [
    { id: 'r1', candidates: [a, b], feedback: review(['a'], ['b']) },
    { id: 'r2', candidates: [{ ...a, carriedFromBatchId: 'r1' }, c], feedback: review(['a', 'c'], []) },
    { id: 'r3', candidates: [{ ...a, carriedFromBatchId: 'r2' }, { ...c, carriedFromBatchId: 'r2' }], feedback: review(['c'], ['a']) },
    { id: 'r4', candidates: [{ ...c, carriedFromBatchId: 'r3' }, reply('d')], feedback: null }
  ])]));
  assert.equal(result.summary.acceptedVotes, 4);
  assert.equal(result.summary.rejectedVotes, 2);
  assert.equal(result.summary.uniqueAccepted, 1);
  assert.equal(result.summary.uniqueRejected, 2);
  assert.equal(result.summary.uniqueUnreviewed, 1);
  assert.equal(result.responses.find(r => r.candidateIds.includes('a')).latestJudgment.batchId, 'r3');
  assert.equal(result.responses.find(r => r.candidateIds.includes('a')).conflictingLabels, true);
  assert.equal(result.responses.find(r => r.candidateIds.includes('c')).judgments.length, 2);
});

test('identical full-text repeats merge only in the same context and follow the newest reviewed label', () => {
  const result = extractEvaluations(raw([
    trial('one', [{ id: 'r1', candidates: [reply('a', 'A warm reply.')], feedback: review(['a'], []) }]),
    trial('two', [{ id: 'r2', candidates: [reply('b', ' A  WARM reply. ')], feedback: review([], ['b'], '2026-11-02T10:01:00.000Z') }]),
    trial('three', [{ id: 'r3', candidates: [reply('c', 'A warm reply.')], feedback: review(['c'], []) }], 'another-scene')
  ]));
  assert.equal(result.responses.length, 2);
  assert.deepEqual(result.responses.find(r => r.contextHash === 'scene').candidateIds, ['a', 'b']);
  assert.equal(result.summary.uniqueAccepted, 1);
  assert.equal(result.summary.uniqueRejected, 1);
});

test('malformed reviews and machine-filtered or unchecked attempts never become human rejection labels', () => {
  const result = extractEvaluations(raw([trial('one', [{ id: 'r1', candidates: [reply('a')],
    feedback: review(['a'], ['a']), screeningAttempts: [
      { attempt: 1, status: 'screened', candidates: [reply('hidden')], blocked: [{ id: 'hidden', matchedId: 'old', reason: 'Copy' }] },
      { attempt: 2, status: 'screening-unavailable', candidates: [reply('unchecked')] }
    ] }])]));
  assert.equal(result.summary.invalidReviews, 1);
  assert.equal(result.summary.uniqueRejected, 0);
  assert.equal(result.summary.uniqueUnreviewed, 1);
  assert.equal(result.summary.automaticBlocked, 1);
  assert.equal(result.summary.failedScreeningAttempts, 1);
  assert.ok(!result.responses.some(r => r.candidateIds.includes('hidden') || r.candidateIds.includes('unchecked')));
});

test('a reused candidate identity with materially changed prose aborts extraction', () => {
  assert.throws(() => extractEvaluations(raw([trial('one', [
    { id: 'r1', candidates: [reply('a', 'Yes.')], feedback: review(['a'], []) },
    { id: 'r2', candidates: [reply('a', 'No.')], feedback: review([], ['a']) }
  ])])), /changed text/);
});

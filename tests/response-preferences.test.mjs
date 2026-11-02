import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim()) throw Error('Use the isolated test runner');
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });
const { getDatabase, closeDatabase } = await import('../backend/db/database.js');
const { ResponseLabRepository } = await import('../backend/repositories/ResponseLabRepository.js');
const { ResponsePreferencesService } = await import('../backend/services/response-preferences.service.js');
const repo = new ResponseLabRepository(), service = new ResponsePreferencesService(repo);
after(closeDatabase);
const now = '2026-11-02T10:00:00.000Z';
for (const id of ['prefs-owner', 'prefs-other']) {
  await getDatabase().prepare('INSERT INTO users(id,username,password_hash,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(id, id, 'fixture-unused', id, now, now);
}
let sequence = 0;
const context = overrides => ({ userId: 'prefs-owner', characterId: 'kana', personaId: 'persona',
  stage: 'Deep Love / Devoted', mood: 'Warm', message: 'Morning. Tea first?', ...overrides });

async function fixture(options = {}) {
  const id = `preference-${++sequence}`;
  const scope = context(options);
  const candidates = ['a', 'b', 'c', 'failed', 'duplicate'].map((suffix, i) => ({
    id: `${id}-${suffix}`, status: i < 3 ? 'complete' : suffix,
    text: options.text || `${id} response ${suffix}.`, prompt: 'PRIVATE_GENERATION_PROMPT', options: { hidden: true }
  }));
  const feedback = options.feedback === null ? null : {
    accepted: [candidates[0].id, candidates[1].id], rejected: [candidates[2].id], favorite: candidates[1].id,
    noneFit: false, reviewedAt: options.reviewedAt || now, ...options.feedback
  };
  const snapshot = { character: { id: scope.characterId }, persona: scope.personaId ? { id: scope.personaId } : null,
    state: { relationshipStage: scope.stage, relationshipMood: scope.mood }, setup: options.setup || 'A quiet breakfast together.' };
  const lab = await repo.create({ id, title: id, snapshot, createdAt: now }, scope.userId);
  const trial = await repo.createTrial({ id: `${id}-trial`, labId: id, context: snapshot,
    contextHash: options.contextHash || id, message: scope.message,
    prepared: { aiOptions: { relationship: { stage: scope.stage, mood: scope.mood } } },
    batches: [{ id: `${id}-batch`, candidates, feedback }], createdAt: now }, scope.userId);
  return { lab, trial, scope, candidates };
}

test('retrieval requires explicit complete feedback and isolates owner, character and persona', async () => {
  const scope = context({ personaId: 'privacy' });
  const own = await fixture(scope);
  await fixture({ ...scope, userId: 'prefs-other' });
  await fixture({ ...scope, characterId: 'other-character' });
  await fixture({ ...scope, personaId: 'other-persona' });
  await fixture({ ...scope, feedback: null });
  const result = await service.forContext(scope);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].trialId, own.trial.id);
  assert.equal(result.groups[0].accepted[0].id, own.candidates[1].id, 'favorite is the first positive example');
  assert.equal(result.groups[0].accepted[0].favorite, true);
  assert.deepEqual(result.groups[0].rejectedIds, [own.candidates[2].id]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_GENERATION_PROMPT'));
  assert.ok(!JSON.stringify(result).includes(own.candidates[3].id));
  assert.equal(await service.forContext({ ...scope, userId: null }), null);
});

test('stage normalization and conflict context prevent applying peaceful romance to a rupture', async () => {
  const scope = context({ personaId: 'stage-and-mood' });
  const peaceful = await fixture({ ...scope, stage: 'Admiration / Romance' });
  const hurt = await fixture({ ...scope, mood: 'Hurt / Heartbroken' });
  await fixture({ ...scope, stage: 'Stranger / Neutral' });
  assert.deepEqual((await service.forContext(scope)).groups.map(g => g.trialId), [peaceful.trial.id]);
  assert.deepEqual((await service.forContext({ ...scope, mood: 'Quarreling / Heated' })).groups.map(g => g.trialId), [hurt.trial.id]);
});

test('undo and deletion remove future guidance immediately without changing saved evidence elsewhere', async () => {
  const scope = context({ personaId: 'undo' });
  const first = await fixture(scope);
  assert.ok(await service.forContext(scope));
  await repo.mutate(first.trial.id, scope.userId, first.trial.revision, t => { t.batches[0].feedback = null; });
  assert.equal(await service.forContext(scope), null);
  const second = await fixture(scope);
  assert.ok(await service.forContext(scope));
  await repo.remove(second.lab.id, scope.userId);
  assert.equal(await service.forContext(scope), null);
});

test('newer none-fit keeps prior accepted examples; undo removes only its own batch evidence', async () => {
  const scope = context({ personaId: 'revision' });
  const current = await fixture(scope);
  const initial = await service.forContext(scope);
  const rejectedCandidates = current.candidates.map(c => ({ ...c, id: `${c.id}-new`, text: `${c.text} New alternative.` }));
  const changed = await repo.mutate(current.trial.id, scope.userId, current.trial.revision, t => {
    t.batches.push({ id: 'new-review', candidates: rejectedCandidates, feedback: {
      accepted: [], rejected: rejectedCandidates.slice(0, 3).map(c => c.id), favorite: null,
      noneFit: true, reviewedAt: '2026-11-02T11:00:00.000Z'
    } });
  });
  const revised = await service.forContext(scope);
  assert.equal(revised.groups.length, 1);
  assert.equal(revised.groups[0].batchId, 'new-review');
  assert.equal(revised.groups[0].noneFit, false);
  assert.equal(revised.groups[0].accepted.length, 2);
  assert.equal(revised.groups[0].accepted[0].batchId, current.trial.batches[0].id);
  assert.equal(revised.groups[0].rejected.length, 1);
  assert.equal(revised.groups[0].rejected[0].batchId, 'new-review');
  assert.notEqual(initial.fingerprint, revised.fingerprint);
  await repo.mutate(current.trial.id, scope.userId, changed.revision, t => { t.batches[0].feedback = null; });
  const afterUndo = await service.forContext(scope);
  assert.equal(afterUndo.groups[0].noneFit, true);
  assert.deepEqual(afterUndo.groups[0].accepted, []);
  assert.equal(afterUndo.groups[0].rejected[0].batchId, 'new-review');
});

test('a newer explicit label overrides an older label only for identical complete response text', async () => {
  const scope = context({ personaId: 'same-response' });
  const current = await fixture(scope);
  const newer = current.candidates.map(c => ({ ...c, id: `${c.id}-again` }));
  await repo.mutate(current.trial.id, scope.userId, current.trial.revision, t => {
    t.batches.push({ id: 'repeat-review', candidates: newer, feedback: {
      accepted: [], rejected: newer.slice(0, 3).map(c => c.id), favorite: null,
      noneFit: true, reviewedAt: '2026-11-02T11:00:00.000Z'
    } });
  });
  const result = await service.forContext(scope);
  assert.equal(result.groups[0].noneFit, true);
  assert.deepEqual(result.groups[0].accepted, []);
  assert.ok(result.groups[0].rejectedIds.every(id => id.endsWith('-again')));
});

test('malformed or partial labels cannot manufacture negative preferences', async () => {
  const scope = context({ personaId: 'invalid-feedback' });
  await fixture({ ...scope, feedback: { rejected: [] } });
  await fixture({ ...scope, feedback: { accepted: [], noneFit: false } });
  const duplicateLabels = await fixture(scope);
  await repo.mutate(duplicateLabels.trial.id, scope.userId, duplicateLabels.trial.revision, t => {
    t.batches[0].feedback.rejected = [...t.batches[0].feedback.accepted];
  });
  assert.equal(await service.forContext(scope), null);
});

test('relevant examples outrank unrelated recent reviews and stay within the prompt budget', async () => {
  const scope = context({ personaId: 'bounds', message: 'Morning tea breakfast kiss' });
  const relevant = await fixture({ ...scope, text: 'x'.repeat(9000), setup: 'k'.repeat(6000), reviewedAt: '2026-11-01T10:00:00.000Z' });
  await fixture({ ...scope, message: 'Tell me about the acting rehearsal', reviewedAt: '2026-11-02T10:00:00.000Z' });
  await fixture({ ...scope, message: 'What is the festival schedule?', reviewedAt: '2026-11-02T11:00:00.000Z' });
  const result = await service.forContext(scope);
  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].trialId, relevant.trial.id);
  assert.equal(result.groups[0].accepted[0].text.length, 1200);
  assert.equal(result.groups[0].accepted[0].truncated, true);
  assert.equal(result.groups[0].rejected[0].text.length, 800);
  assert.equal(result.groups[0].rejected[0].truncated, true);
  assert.ok(JSON.stringify(result).length <= 10000);
});

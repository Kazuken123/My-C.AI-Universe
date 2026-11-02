import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';

if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim()) throw Error('Use the isolated test runner');
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });
const { responseLabService: service } = await import('../backend/services/response-lab.service.js');
const { prepareResponseContext } = await import('../backend/services/response-context.js');
const { AppraisalService } = await import('../backend/services/appraisal.service.js');
const { ResponsePreferencesService } = await import('../backend/services/response-preferences.service.js');
const { collectTournamentMemory } = await import('../backend/services/response-tournament.js');
const { getDatabase } = await import('../backend/db/database.js');
const { serverInstance } = await import('../server.js');
if (!serverInstance.httpServer.listening) await once(serverInstance.httpServer, 'listening');
after(async () => { await Promise.all([...service.jobs.values()]); serverInstance.httpServer.closeAllConnections(); await serverInstance.stop(); });

const base = `http://127.0.0.1:${serverInstance.httpServer.address().port}`;
const prefix = '/api/response-lab';
const generationCalls = [], screeningCalls = [];
let sequence = 0, requests = 0, prepareCount = 0, screeningPlan = null, providerFailure = false, providerGate = null, providerEntered = null;
service.providers.gemini = { modelName: 'tournament-fixture', async generateReply(character, message, history, options) {
  generationCalls.push(structuredClone({ character, message, history, options }));
  if (providerGate) { providerEntered?.(); await providerGate; }
  if (providerFailure) throw Error('Fixture generation unavailable');
  const alternatives = Array.from({ length: 5 }, () => {
    const n = ++sequence;
    const paragraphs = [
      { kind: 'narration', sentences: ['She settles beside the table.', 'Her attention remains on the conversation.'] },
      { kind: 'dialogue', content: `Distinct fixture possibility ${n}.` },
      { kind: 'narration', sentences: ['She pauses to listen.', 'She leaves the next move to her companion.'] },
      { kind: 'dialogue', content: `There is room for your answer in possibility ${n}.` }
    ];
    if (options.labPromptVersion === 'character-v1') {
      for (const p of paragraphs) if (p.kind === 'narration') { p.content = p.sentences.join(' '); delete p.sentences; }
    }
    return { move: `Distinct fixture move ${n}`, paragraphs };
  });
  return JSON.stringify({ alternatives });
} };
service.screening = { async screen(input) {
  screeningCalls.push(structuredClone(input));
  if (screeningPlan) return screeningPlan(input);
  return { allowedIds: input.candidates.map(c => c.id), blocked: [], method: 'fixture-semantic' };
} };
service.prepare = args => { prepareCount++; return prepareResponseContext({ ...args, appraiser: new AppraisalService(async () => JSON.stringify({
  intent: 'stage_maintenance', userEffort: 'low', contextStakes: 'mundane', evidence: args.message, reason: 'Familiar conversation',
  mood: 'Warm', intensity: .2, affinityDelta: 0, trustDelta: 0, strainDelta: 0
})) }); };

async function api(url, method = 'GET', body, token) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function ok(url, method, body, token) {
  const result = await api(url, method, body, token);
  assert.ok(result.status < 300, JSON.stringify(result)); return result.data;
}
const owner = await ok('/api/auth/register', 'POST', { username: 'tournament_owner', password: 'FixturePassword123', displayName: 'Tournament Owner' });
const stranger = await ok('/api/auth/register', 'POST', { username: 'tournament_other', password: 'FixturePassword123', displayName: 'Other' });
const persona = await ok('/api/personas', 'POST', { name: 'Tony', description: 'A longtime partner.' }, owner.token);
const lab = await ok(prefix, 'POST', { characterId: '1766394139616', personaId: persona.id, stage: 'Deep Love / Devoted', title: 'Tournament fixture', setup: 'A quiet morning together at home.' }, owner.token);
const read = trial => service.repo.trial(trial.id, owner.user.id);
const newTrial = message => ok(`${prefix}/labs/${lab.id}/trials`, 'POST', { message, requestId: `tournament-trial-${++requests}` }, owner.token);
async function start(trial, extra = {}) {
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: `tournament-round-${++requests}`, mode: 'tournament', ...(trial.batches.length ? { sourceBatchId: trial.batches.at(-1).id } : {}), ...extra }, owner.token);
  await service.jobs.get(trial.id);
  return read(trial);
}
async function rate(trial, accepted, extra = {}) {
  return ok(`${prefix}/trials/${trial.id}/batches/${trial.batches.at(-1).id}/feedback`, 'PUT', {
    revision: trial.revision, accepted, noneFit: accepted.length === 0, ...extra
  }, owner.token);
}

test('accepted answers survive unchanged while rejected options become screening evidence on the same frozen turn', async () => {
  const beforePrepare = prepareCount;
  let trial = await start(await newTrial('Morning. Tea first?'));
  const first = structuredClone(trial.batches[0]);
  assert.equal(first.tournament, true);
  assert.equal(first.roundNumber, 1);
  assert.equal(first.candidates.length, 5);
  assert.equal(first.feedback, null);
  const winner = first.candidates[2];
  const rejected = first.candidates.filter(c => c.id !== winner.id);
  const hash = trial.contextHash;

  assert.equal((await api(`${prefix}/trials/${trial.id}/batches`, 'POST', {
    revision: trial.revision, requestId: 'unreviewed-source', mode: 'tournament', sourceBatchId: first.id
  }, owner.token)).status, 409, 'unreviewed answers must not silently become rejections');
  trial = await rate(trial, [winner.id], { favorite: winner.id });
  const revision = trial.revision;
  const requestId = 'accepted-next-round';
  trial = await start(trial, { requestId });
  const second = trial.batches.at(-1);
  const carried = second.candidates.find(c => c.id === winner.id);
  assert.equal(second.roundNumber, 2);
  assert.equal(second.sourceBatchId, first.id);
  assert.equal(second.carriedCount, 1);
  assert.equal(second.challengerCount, 5);
  assert.equal(second.candidates.length, 6);
  assert.equal(carried.text, winner.text);
  assert.equal(carried.carriedFromBatchId, first.id);
  assert.equal(carried.originBatchId, first.id);
  assert.equal(second.feedback, null, 'a previous win must not fabricate a review of the new round');
  assert.equal(trial.contextHash, hash);
  assert.equal(prepareCount, beforePrepare + 1, 'rounds do not re-appraise or change relationship scores');
  const screen = screeningCalls.at(-1);
  for (const c of rejected) assert.ok(screen.rejected.some(r => r.id === c.id && r.text === c.text));
  assert.ok(!screen.rejected.some(r => r.id === winner.id));
  assert.ok(screen.existing.some(r => r.id === winner.id && r.text === winner.text));

  const calls = generationCalls.length;
  const replay = await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision, requestId, mode: 'tournament', sourceBatchId: first.id }, owner.token);
  assert.equal(replay.batches.length, 2);
  assert.equal(generationCalls.length, calls);
  for (const body of [{ clear: true }, { accepted: [], noneFit: true }]) {
    assert.equal((await api(`${prefix}/trials/${trial.id}/batches/${first.id}/feedback`, 'PUT', { revision: trial.revision, ...body }, owner.token)).status, 409, 'advanced source ratings cannot rewrite tournament lineage');
  }
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'foreign-round', mode: 'tournament', sourceBatchId: second.id }, stranger.token)).status, 404);
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision, requestId: 'stale-round', mode: 'tournament', sourceBatchId: second.id }, owner.token)).status, 409);
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'old-source', mode: 'tournament', sourceBatchId: first.id }, owner.token)).status, 409);
});

test('screened-out paraphrases are replaced, bounded retries publish fewer challengers and never label hidden answers rejected', async () => {
  let trial = await start(await newTrial('We have the evening free.'));
  const first = trial.batches.at(-1);
  trial = await rate(trial, [first.candidates[0].id]);
  const rejectedId = first.candidates[1].id;
  let attempts = 0;
  const hidden = [];
  screeningPlan = input => {
    attempts++;
    const allowedIds = attempts === 1 ? [input.candidates[0].id] : [];
    const blocked = input.candidates.filter(c => !allowedIds.includes(c.id)).map(c => ({ id: c.id, reason: 'Same rejected conversational reaction despite different wording', matchedId: rejectedId }));
    hidden.push(...blocked.map(c => c.id));
    return { allowedIds, blocked, method: 'fixture-semantic' };
  };
  try { trial = await start(trial); } finally { screeningPlan = null; }
  const second = trial.batches.at(-1);
  assert.equal(attempts, 3, 'generation attempts must be bounded');
  assert.equal(second.candidates.filter(c => c.status === 'complete').length, 2, 'winner plus only the screened distinct challenger');
  assert.ok(second.screening.incomplete);
  assert.ok(second.screening.filteredCount > 0);
  assert.ok(second.candidates.every(c => !hidden.includes(c.id)));
  assert.equal(second.feedback, null);
  trial = await rate(trial, second.candidates.map(c => c.id));
  assert.deepEqual(trial.batches.at(-1).feedback.rejected, [], 'hidden filtered alternatives are not explicit user dislikes');
  const visible = (await ok(`${prefix}/labs/${lab.id}`, 'GET', null, owner.token)).trials.find(t => t.id === trial.id).batches.at(-1);
  assert.equal(visible.tournamentMemory, undefined);
  assert.ok(!JSON.stringify(visible).includes(hidden[0]), 'raw screening records are not sent to the review page');
  const exported = await ok(`${prefix}/labs/${lab.id}/export`, 'GET', null, owner.token);
  assert.ok(JSON.stringify(exported.trials.find(t => t.id === trial.id).batches.at(-1)).includes(hidden[0]), 'raw export retains filtering provenance');
});

test('screening outages retain winners, never expose unscreened replies, and empty failed rounds can retry without fake feedback', async () => {
  let trial = await start(await newTrial('Which film do you want?'));
  const winner = trial.batches.at(-1).candidates[0];
  trial = await rate(trial, [winner.id]);
  screeningPlan = () => { throw Error('Fixture screening unavailable'); };
  try { trial = await start(trial); } finally { screeningPlan = null; }
  const failed = trial.batches.at(-1);
  assert.deepEqual(failed.candidates.map(c => c.id), [winner.id]);
  assert.equal(failed.candidates[0].text, winner.text);
  assert.equal(failed.feedback, null);
  assert.ok(failed.screening.unavailable && failed.screening.incomplete);
  trial = await rate(trial, []);
  const eliminatedId = winner.id;
  providerFailure = true;
  try { trial = await start(trial); } finally { providerFailure = false; }
  assert.equal(trial.batches.at(-1).candidates.filter(c => c.status === 'complete').length, 0);
  assert.equal(trial.batches.at(-1).feedback, null);
  trial = await start(trial);
  assert.equal(trial.batches.at(-1).candidates.filter(c => c.status === 'complete').length, 5);
  assert.ok(screeningCalls.at(-1).rejected.some(c => c.id === eliminatedId), 'later elimination supersedes the earlier win');
});

test('carried stable IDs are not duplicated in preferences and reviews with more than ten survivors remain valid', async () => {
  let trial = await start(await newTrial('A different quiet conversation.'));
  const firstIds = trial.batches.at(-1).candidates.map(c => c.id);
  trial = await rate(trial, firstIds);
  trial = await start(trial);
  trial = await rate(trial, trial.batches.at(-1).candidates.map(c => c.id));
  trial = await start(trial);
  assert.equal(trial.batches.at(-1).candidates.length, 15);
  const ids = trial.batches.at(-1).candidates.map(c => c.id);
  trial = await rate(trial, ids.filter(id => id !== firstIds[0]));
  trial = await read(trial);
  const preferences = await new ResponsePreferencesService(service.repo).forContext({ userId: owner.user.id,
    characterId: lab.snapshot.character.id, personaId: lab.snapshot.persona.id,
    stage: trial.prepared.evaluatedState.relationshipStage, mood: trial.prepared.evaluatedState.relationshipMood,
    message: trial.message, setup: lab.snapshot.setup });
  const group = preferences.groups.find(g => g.contextHash === trial.contextHash);
  assert.ok(group, 'reviews larger than the former five/ten-answer limit are usable');
  assert.equal(new Set(group.acceptedIds).size, group.acceptedIds.length);
  assert.ok(!group.acceptedIds.includes(firstIds[0]), 'eliminated carried answers lose their previous positive label');
  assert.ok(group.rejectedIds.includes(firstIds[0]));
  assert.equal(group.acceptedIds.length, 14, 'survivors from earlier rounds count once, not once per advancement');
});

test('tournament choices supersede broad older preference examples without changing frozen appraisal or scene', async () => {
  const previousPreferences = service.preferences;
  const obsolete = { version: 'reviewed-examples-v1', fingerprint: 'obsolete-caretaker-example', groups: [{
    prompt: 'An older morning prompt', setup: 'An older scene', reviewedBatchCount: 1,
    accepted: [{ id: 'old-caretaker', text: 'Obsolete accepted sample: you look exhausted; let me take care of everything.' }],
    rejected: [], acceptedIds: ['old-caretaker'], rejectedIds: [], noneFit: false
  }] };
  let lookupCount = 0;
  service.preferences = { async forContext() { lookupCount++; return structuredClone(obsolete); } };
  try {
    let trial = await start(await newTrial('Stay here a minute and tell me what you want.'), { mode: 'standard' });
    assert.deepEqual(generationCalls.at(-1).options.writingPreferences, obsolete, 'fixture proves older exemplars would be available through general retrieval');
    const winner = trial.batches.at(-1).candidates[1];
    const prepared = structuredClone(trial.prepared), context = structuredClone(trial.context);
    const initialPrepareCount = prepareCount;
    trial = await rate(trial, [winner.id]);
    const beforeCalls = generationCalls.length;
    trial = await start(trial);
    assert.equal(lookupCount, 1, 'tournament generation skips the broader preference lookup');
    for (const call of generationCalls.slice(beforeCalls)) {
      assert.equal(call.options.writingPreferences, null, 'old positives cannot override the latest tournament choice');
      assert.ok(call.options.labTournament.survivors.includes(winner.move), 'current winner still informs the new challenger generation');
      assert.deepEqual(call.options.appraisal, prepared.appraisal);
      assert.ok(!JSON.stringify(call.options).includes('Obsolete accepted sample'));
    }
    assert.equal(trial.batches.at(-1).writingPreferences, null);
    assert.equal(trial.batches.at(-1).preferenceFingerprint, null);
    assert.equal(trial.batches.at(-1).preferenceReviewCount, 0);
    assert.deepEqual(trial.prepared, prepared, 'frozen appraisal and evaluated relationship remain untouched');
    assert.deepEqual(trial.context, context, 'writing preferences do not become scene facts');
    assert.equal(prepareCount, initialPrepareCount);
  } finally { service.preferences = previousPreferences; }
});

test('existing comparisons can seed tournaments without changing old answers or allowing historical unreviewed batches to become dislikes', async () => {
  let trial = await newTrial('Can we talk about earlier?');
  trial = await start(trial, { mode: 'standard' });
  const unreviewedIds = trial.batches.at(-1).candidates.map(c => c.id);
  trial = await start(trial, { mode: 'comparison', sourceBatchId: undefined });
  const comparison = trial.batches.at(-1);
  assert.equal(comparison.candidates.length, 10);
  const winners = comparison.candidates.slice(0, 2);
  trial = await rate(trial, winners.map(c => c.id));
  trial = await start(trial);
  const round = trial.batches.at(-1);
  assert.equal(round.tournament, true);
  assert.equal(round.candidates.length, 7);
  for (const winner of winners) assert.equal(round.candidates.find(c => c.id === winner.id).text, winner.text);
  assert.ok(screeningCalls.at(-1).rejected.every(c => !unreviewedIds.includes(c.id)));
  assert.equal(trial.batches[0].feedback, null);
});

test('exact-context rejections from another trial are remembered without leaking another scene or owner', async () => {
  const message = 'Shall we spend this morning together?';
  let earlier = await start(await newTrial(message));
  const earlierCandidates = earlier.batches.at(-1).candidates;
  earlier = await rate(earlier, [earlierCandidates[0].id]);
  const acceptedId = earlierCandidates[0].id, rejectedIds = earlierCandidates.slice(1).map(c => c.id);
  let unrelated = await start(await newTrial('Why did you dismiss my opinion?'));
  const unrelatedIds = unrelated.batches.at(-1).candidates.map(c => c.id);
  unrelated = await rate(unrelated, []);
  const foreignLab = await service.repo.create({ ...structuredClone(lab), id: 'foreign-context-collision' }, stranger.user.id);
  await service.repo.createTrial({ id: 'foreign-context-collision-trial', labId: foreignLab.id,
    context: foreignLab.snapshot, contextHash: earlier.contextHash, message, prepared: null, createdAt: new Date().toISOString(),
    batches: [{ id: 'foreign-rated-batch', candidates: [{ id: 'foreign-rejected-candidate', status: 'complete', text: 'PRIVATE FOREIGN REJECTION', move: 'Foreign move' }],
      feedback: { accepted: [], rejected: ['foreign-rejected-candidate'], favorite: null, noneFit: true, reviewedAt: new Date().toISOString() } }]
  }, stranger.user.id);
  const current = await start(await newTrial(message));
  assert.equal(current.contextHash, earlier.contextHash);
  const screen = screeningCalls.at(-1);
  for (const id of rejectedIds) assert.ok(screen.rejected.some(c => c.id === id));
  assert.ok(!screen.rejected.some(c => c.id === acceptedId));
  assert.ok(!screen.rejected.some(c => unrelatedIds.includes(c.id)));
  assert.ok(!JSON.stringify(screen).includes('PRIVATE FOREIGN REJECTION'));
});

test('same-timestamp elimination overrides an earlier win and unreviewed or invalid labels never become vetoes', () => {
  const time = '2026-11-02T12:00:00.000Z';
  const winner = { id: 'carried-answer', text: 'A personal reply.', status: 'complete', move: 'Personal response' };
  const equivalent = { ...winner, id: 'repeated-text', text: ' A   personal REPLY. ' };
  const unreviewed = { id: 'unreviewed-answer', text: 'Unreviewed alternative.', status: 'complete' };
  const trial = { id: 'label-order', batches: [
    { id: 'first', candidates: [winner], feedback: { accepted: [winner.id], rejected: [], favorite: null, noneFit: false, reviewedAt: time } },
    { id: 'second', candidates: [winner], feedback: { accepted: [], rejected: [winner.id], favorite: null, noneFit: true, reviewedAt: time } },
    { id: 'unreviewed', candidates: [unreviewed], feedback: null },
    { id: 'malformed', candidates: [unreviewed], feedback: { accepted: [unreviewed.id], rejected: [unreviewed.id], noneFit: false, reviewedAt: time } }
  ] };
  const memory = collectTournamentMemory(trial);
  assert.deepEqual(memory.accepted, []);
  assert.deepEqual(memory.rejected.map(c => c.id), [winner.id]);
  const later = { id: 'newer-identical-text', trialId: 'another-trial', candidates: [equivalent],
    feedback: { accepted: [equivalent.id], rejected: [], favorite: null, noneFit: false, reviewedAt: '2026-11-02T12:01:00.000Z' } };
  const revised = collectTournamentMemory(trial, [later]);
  assert.deepEqual(revised.rejected, []);
  assert.deepEqual(revised.accepted.map(c => c.id), [equivalent.id], 'latest explicit judgment applies to identical prose even with a fresh ID');
});

test('expired tournament work leaves carried winners available without silently retrying generation', async () => {
  let trial = await start(await newTrial('Tell me what you think.'));
  const winner = trial.batches.at(-1).candidates[0];
  trial = await rate(trial, [winner.id]);
  let release;
  providerGate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { providerEntered = resolve; });
  try {
    const claimed = await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', {
      revision: trial.revision, requestId: 'interrupted-next-round', mode: 'tournament', sourceBatchId: trial.batches.at(-1).id
    }, owner.token);
    assert.equal(claimed.status, 'generating');
    assert.equal(claimed.batches.at(-1).candidates.find(c => c.id === winner.id).text, winner.text, 'winner is persisted before slow provider work');
    await entered;
    // Expiration simulates a worker losing its lease while generation is pending.
    await getDatabase().prepare('UPDATE response_lab_trials SET lease_until=0 WHERE id=?').run(trial.id);
    const before = generationCalls.length;
    const reloaded = (await ok(`${prefix}/labs/${lab.id}`, 'GET', null, owner.token)).trials.find(t => t.id === trial.id);
    assert.equal(reloaded.status, 'interrupted');
    assert.equal(reloaded.batches.at(-1).candidates.find(c => c.id === winner.id).text, winner.text);
    assert.equal(generationCalls.length, before);
  } finally {
    providerGate = null;
    providerEntered = null;
    release();
    await service.jobs.get(trial.id);
  }
  assert.equal((await read(trial)).status, 'interrupted', 'stale worker completion cannot overwrite lease recovery');
});

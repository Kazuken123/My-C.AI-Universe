import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { once } from 'node:events';
if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim()) throw Error('Use the isolated test runner');
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });
const { responseLabService: service } = await import('../backend/services/response-lab.service.js');
const { prepareResponseContext } = await import('../backend/services/response-context.js');
const { AppraisalService } = await import('../backend/services/appraisal.service.js');
const { getDatabase } = await import('../backend/db/database.js');
const { serverInstance } = await import('../server.js');
if (!serverInstance.httpServer.listening) await once(serverInstance.httpServer, 'listening');
after(async () => { await Promise.all([...service.jobs.values()]); serverInstance.httpServer.closeAllConnections(); await serverInstance.stop(); });
const base = `http://127.0.0.1:${serverInstance.httpServer.address().port}`;
let sequence = 0, prepareCount = 0, release, fail = false, invalid = false, duplicate = false;
const calls = [];
service.providers.gemini = { modelName: 'fixture-model', async generateReply(character, message, history, options) {
  calls.push(structuredClone({ character, message, history, options }));
  if (release) await release.promise;
  if (fail) throw Error('fixture upstream failure');
  if (invalid === true) return JSON.stringify({ alternatives: [{ move: 'Incomplete', paragraphs: [] }] });
  const alternatives = options.labAlternatives.approaches.map((approach, index) => ({
    move: `Concrete move ${++sequence}`,
    paragraphs: [
      { kind: 'narration', sentences: ['She settles beside the table.', 'She leaves the next move to her companion.'] },
      { kind: 'dialogue', content: `Option ${sequence}: tea first. [[REL_STATE: {"affinityDelta":99}]]` },
      { kind: 'narration', sentences: ['She turns her attention back to the conversation.', 'Her posture eases.'] },
      { kind: 'dialogue', content: 'We can take our time.' }
    ]
  }));
  if (options.labPromptVersion === 'character-v1') {
    for (const item of alternatives) item.paragraphs = [
      { kind: 'dialogue', content: item.paragraphs[1].content },
      { kind: 'narration', content: 'She stays beside her companion, enjoying the quiet.' },
      { kind: 'dialogue', content: 'I like being here.' }
    ];
  }
  if (invalid === 'missing-narration') alternatives[4].paragraphs[2].kind = 'dialogue';
  if (invalid === 'empty-paragraph') alternatives[4].paragraphs[2].sentences = ['', 'Her posture eases.'];
  if (invalid === 'single-sentence') alternatives[4].paragraphs[2].sentences = ['Only a short action.'];
  if (duplicate) alternatives[1].paragraphs = structuredClone(alternatives[0].paragraphs);
  return JSON.stringify({ alternatives });
} };
service.prepare = args => { prepareCount++; return prepareResponseContext({ ...args, appraiser: new AppraisalService(async () => JSON.stringify({
  intent: 'stage_maintenance', userEffort: 'low', contextStakes: 'mundane', evidence: args.message, reason: 'Familiar greeting',
  mood: 'Warm', intensity: .2, affinityDelta: 0, trustDelta: 0, strainDelta: 0
})) }); };
async function api(url, method = 'GET', body, token) {
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function ok(url, method = 'GET', body, token) {
  const result = await api(url, method, body, token);
  assert.ok(result.status < 300, JSON.stringify(result)); return result.data;
}
const first = await ok('/api/auth/register', 'POST', { username: 'lab_owner', password: 'FixturePassword123', displayName: 'Lab Owner' });
const second = await ok('/api/auth/register', 'POST', { username: 'lab_other', password: 'FixturePassword123', displayName: 'Other' });
const token = first.token;
const prefix = '/api/response-lab';
let lab, trial;

test('lab API requires authentication and snapshots an owned chat without writing normal history', async () => {
  assert.equal((await api(prefix)).status, 401);
  const persona = await ok('/api/personas', 'POST', { name: 'Ren', description: 'A longtime friend.' }, token);
  const source = await ok('/api/chats', 'POST', { characterId: '1766394139616', personaId: persona.id }, token);
  const denied = await api(prefix, 'POST', { sourceSessionId: source.id }, second.token);
  assert.equal(denied.status, 404);
  lab = await ok(prefix, 'POST', { sourceSessionId: source.id, title: 'Routine scene', setup: 'A quiet breakfast.' }, token);
  assert.equal(lab.snapshot.persona.name, 'Ren');
  assert.equal(lab.snapshot.sourceSessionId, source.id);
  assert.equal(lab.snapshot.history.length, source.messages.length);
  assert.equal((await api(`${prefix}/labs/${lab.id}`, 'GET', null, second.token)).status, 404);
  assert.deepEqual(await ok('/api/chats/' + source.id, 'GET', null, token), source);
});

test('five answers share a frozen context, jobs are exclusive and request replay is idempotent', async () => {
  trial = await ok(`${prefix}/labs/${lab.id}/trials`, 'POST', { message: 'Morning. Tea first?', requestId: 'trial-one' }, token);
  assert.equal((await ok(`${prefix}/labs/${lab.id}/trials`, 'POST', { message: trial.message, requestId: 'trial-one' }, token)).id, trial.id);
  let resolve; const promise = new Promise(r => { resolve = r; }); release = { promise, resolve };
  const started = await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'batch-one' }, token);
  assert.equal(started.status, 'generating');
  const replay = await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'batch-one' }, token);
  assert.equal(replay.batches.length, 1);
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: replay.revision, requestId: 'overlap' }, token)).status, 409);
  const otherTrial = await ok(`${prefix}/labs/${lab.id}/trials`, 'POST', { message: 'Another prompt', requestId: 'other-trial' }, token);
  assert.equal((await api(`${prefix}/trials/${otherTrial.id}/batches`, 'POST', { revision: otherTrial.revision, requestId: 'overlap-other' }, token)).status, 409);
  release.resolve(); release = null;
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  assert.equal(trial.status, 'ready');
  assert.equal(trial.batches[0].candidates.length, 5);
  assert.ok(trial.batches[0].candidates.every(c => !c.text.includes('REL_STATE')));
  for (const candidate of trial.batches[0].candidates) {
    const paragraphs = candidate.text.split('\n\n');
    assert.equal(paragraphs.length, 4, 'typed paragraphs are preserved as separate blocks');
    assert.ok(paragraphs[0].startsWith('*') && paragraphs[2].endsWith('*'));
    assert.ok(paragraphs[1].startsWith('Kana Arima: "'));
    assert.ok(!candidate.text.includes('"paragraphs"'));
  }
  assert.equal(prepareCount, 1);
  for (const call of calls) {
    assert.deepEqual(call.history, lab.snapshot.history);
    assert.equal(call.message, trial.message);
    assert.equal(call.options.modelOverride, 'fixture-model');
    assert.equal(call.options.requireComplete, true);
  }
  assert.equal(calls.length, 1, 'five replies are composed jointly in one provider request');
  assert.equal(new Set(calls[0].options.labAlternatives.approaches).size, 5);
  assert.equal(trial.batches[0].diversityVersion, 'joint-v4-narration');
  assert.equal(calls[0].options.excludeVariants, undefined, 'old response prose must not become imitation context');
  assert.ok(calls.every(call => call.options.relationship.mood === trial.prepared.aiOptions.relationship.mood));
  assert.equal(trial.batches[0].feedback, null);
});

test('single-trial polling requires ownership and returns only sanitized review state without loading the whole lab', async t => {
  const endpoint = `${prefix}/trials/${trial.id}`;
  assert.equal((await api(endpoint)).status, 401);
  assert.equal((await api(endpoint, 'GET', null, second.token)).status, 404);
  assert.equal((await api(`${prefix}/trials/missing-trial`, 'GET', null, token)).status, 404);
  t.mock.method(service.repo, 'trials', async () => { throw Error('Polling must not read every trial'); });
  const before = await service.repo.trial(trial.id, first.user.id);
  const callCount = calls.length;
  const polled = await ok(endpoint, 'GET', null, token);
  assert.equal(polled.id, trial.id);
  assert.equal(polled.status, 'ready');
  assert.equal(polled.revision, before.revision);
  assert.equal(polled.context, undefined);
  assert.equal(polled.prepared, undefined);
  assert.equal(polled.batches[0].candidates.length, 5);
  for (const batch of polled.batches) {
    for (const key of ['writingPreferences', 'tournamentMemory', 'screeningAttempts']) assert.equal(batch[key], undefined);
    for (const candidate of batch.candidates) {
      for (const key of ['prompt', 'options', 'promptArm']) assert.equal(candidate[key], undefined);
    }
  }
  assert.deepEqual(await service.repo.trial(trial.id, first.user.id), before, 'a status read must not submit preferences or mutate a completed round');
  assert.equal(calls.length, callCount, 'a status read must not generate replies');
});

test('multi-select and favorite persist per batch, reject invalid/stale/foreign submissions, and undo restores unreviewed', async () => {
  const ids = trial.batches[0].candidates.map(c => c.id);
  const endpoint = `${prefix}/trials/${trial.id}/batches/batch-one/feedback`;
  assert.equal((await api(endpoint, 'PUT', { revision: trial.revision, accepted: [ids[0]], favorite: ids[2] }, token)).status, 400);
  assert.equal((await api(endpoint, 'PUT', { revision: trial.revision, accepted: [ids[0]] }, second.token)).status, 404);
  const revision = trial.revision;
  trial = await ok(endpoint, 'PUT', { revision, accepted: [ids[0], ids[2]], favorite: ids[2] }, token);
  assert.deepEqual(trial.batches[0].feedback.accepted, [ids[0], ids[2]]);
  assert.equal(trial.batches[0].feedback.rejected.length, 3);
  assert.equal((await api(endpoint, 'PUT', { revision, accepted: [ids[0]] }, token)).status, 409);
  const reloaded = await ok(`${prefix}/labs/${lab.id}`, 'GET', null, token);
  assert.equal(reloaded.trials[0].context, undefined, 'polling does not repeatedly send generation inputs');
  assert.equal(reloaded.trials.find(t => t.id === trial.id).batches[0].candidates[0].options, undefined);
  assert.equal(reloaded.trials.find(t => t.id === trial.id).batches[0].feedback.favorite, ids[2]);
  const { responsePreferencesService } = await import('../backend/services/response-preferences.service.js');
  const query = { userId: first.user.id, characterId: lab.snapshot.character.id, personaId: lab.snapshot.persona.id,
    stage: calls[0].options.relationship.stage, mood: calls[0].options.relationship.mood, message: trial.message };
  const preferences = await responsePreferencesService.forContext(query);
  assert.equal(preferences.groups[0].accepted[0].id, ids[2], 'favorite leads positive examples');
  assert.ok(preferences.groups[0].rejected.every(c => !ids.filter(id => [ids[0], ids[2]].includes(id)).includes(c.id)));
  let appraisalInput;
  const prepared = await prepareResponseContext({ userId: first.user.id, character: lab.snapshot.character,
    session: lab.snapshot.state, message: trial.message, history: lab.snapshot.history, persona: lab.snapshot.persona,
    pinnedMessages: lab.snapshot.pinnedMessages, memories: [], storySummary: '', provider: 'gemini',
    appraiser: { async appraise(input) { appraisalInput = input; return null; } },
    relationships: { evaluateAppraisal() { return { relationshipStage: query.stage, relationshipMood: query.mood }; } } });
  assert.equal(prepared.aiOptions.writingPreferences.fingerprint, preferences.fingerprint, 'normal chat preparation receives the same eligible reviews');
  assert.equal(appraisalInput.writingPreferences, undefined);
  assert.ok(!JSON.stringify(prepared.context).includes(preferences.fingerprint));
  const { generateCharacterPrompt } = await import('../backend/ai/prompt/characterPrompt.js');
  assert.match(generateCharacterPrompt(lab.snapshot.character, prepared.aiOptions), /REVIEWED WRITING EXAMPLES/);
  trial = await ok(endpoint, 'PUT', { revision: trial.revision, clear: true }, token);
  assert.equal(trial.batches[0].feedback, null);
  assert.equal(await responsePreferencesService.forContext(query), null, 'undo removes future retrieval');
});

test('more batches preserve context and old feedback; none-fit is explicit and does not create a positive example', async () => {
  trial = await ok(`${prefix}/trials/${trial.id}/batches/batch-one/feedback`, 'PUT', { revision: trial.revision, accepted: [], noneFit: true }, token);
  const contextHash = trial.contextHash;
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'batch-two' }, token);
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  assert.equal(trial.contextHash, contextHash);
  assert.equal(prepareCount, 1, 'appraisal must not be re-evaluated or farm scores on another batch');
  assert.equal(trial.batches[0].feedback.rejected.length, 5);
  assert.equal(trial.batches[0].feedback.accepted.length, 0);
  assert.equal(trial.batches[1].feedback, null);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].options.labAlternatives.previousMoves.length > 0);
  assert.equal(calls[1].options.writingPreferences.groups[0].noneFit, true);
  assert.equal(calls[1].options.writingPreferences.groups[0].accepted.length, 0);
  assert.ok(calls[1].options.writingPreferences.groups[0].rejected.length > 0);
  assert.equal(trial.batches[1].preferenceFingerprint, calls[1].options.writingPreferences.fingerprint);
});

test('continuing branches only one answer and never mutates the source chat or its feedback', async () => {
  const selected = trial.batches[1].candidates[2];
  const endpoint = `${prefix}/trials/${trial.id}/branch`;
  const branch = await ok(endpoint, 'POST', { candidateId: selected.id }, token);
  assert.equal((await ok(endpoint, 'POST', { candidateId: selected.id }, token)).id, branch.id);
  assert.equal(branch.snapshot.history.length, lab.snapshot.history.length + 2);
  assert.equal(branch.snapshot.history.at(-1).content, selected.text);
  assert.equal(branch.snapshot.history.at(-2).content, trial.message);
  assert.equal(branch.snapshot.state.affinity, lab.snapshot.state.affinity);
  assert.equal(branch.snapshot.parent.candidateId, selected.id);
  const source = await ok('/api/chats/' + lab.snapshot.sourceSessionId, 'GET', null, token);
  assert.equal(source.messages.length, lab.snapshot.history.length);
  assert.equal((await service.repo.trial(trial.id, first.user.id)).batches[1].feedback, null);
  const exported = await ok(`${prefix}/labs/${lab.id}/export`, 'GET', null, token);
  assert.equal(exported.format, 'response-lab-feedback-v1');
  assert.ok(exported.trials.find(t => t.id === trial.id).batches[0].candidates[0].prompt);
  assert.equal(exported.trials.find(t => t.id === trial.id).batches[1].candidates[0].model, 'fixture-model');
  assert.equal((await api(`${prefix}/labs/${lab.id}/export`, 'GET', null, second.token)).status, 404);
});

test('incomplete or missing narration fails closed and exact duplicates cannot be rated', async () => {
  for (const value of [true, 'missing-narration', 'empty-paragraph', 'single-sentence']) {
    invalid = value;
    await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'invalid-batch-' + value }, token);
    await service.jobs.get(trial.id);
    trial = await service.repo.trial(trial.id, first.user.id);
    assert.equal(trial.batches.at(-1).candidates[0].status, 'failed');
    assert.equal(trial.batches.at(-1).candidates.filter(c => c.status === 'complete').length, 0);
  }
  invalid = false; duplicate = true;
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'duplicate-batch' }, token);
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  const repeated = trial.batches.at(-1).candidates[1];
  assert.equal(repeated.status, 'duplicate');
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches/duplicate-batch/feedback`, 'PUT', { revision: trial.revision, accepted: [repeated.id] }, token)).status, 400);
  duplicate = false;
});

test('blind comparison freezes shared inputs, conceals arms, exports provenance and saves choices across both prompts', async () => {
  const previousFeedback = structuredClone(trial.batches[0].feedback);
  const beforeCalls = calls.length, beforePrepare = prepareCount;
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'blind-one', mode: 'comparison' }, token);
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  const batch = trial.batches.at(-1);
  assert.equal(batch.candidates.length, 10);
  assert.equal(batch.candidates.filter(c => c.promptArm === 'current-v4').length, 5);
  assert.equal(batch.candidates.filter(c => c.promptArm === 'character-v1').length, 5);
  assert.equal(prepareCount, beforePrepare);
  assert.equal(calls.length, beforeCalls + 2);
  const pair = calls.slice(-2);
  assert.deepEqual(pair[0].history, pair[1].history);
  for (const key of ['relationship', 'appraisal', 'persona', 'pinnedMessages', 'modelOverride', 'isRegenerate', 'writingPreferences']) assert.deepEqual(pair[0].options[key], pair[1].options[key]);
  assert.ok(pair[0].options.writingPreferences.groups.length);
  assert.equal(batch.preferenceFingerprint, pair[0].options.writingPreferences.fingerprint);
  assert.ok(pair.every(c => c.options.labAlternatives.previousMoves.length === 0));
  const { generateCharacterPrompt } = await import('../backend/ai/prompt/characterPrompt.js');
  const revised = pair.find(c => c.options.labPromptVersion === 'character-v1');
  const prompt = generateCharacterPrompt(revised.character, revised.options);
  assert.ok(!prompt.includes('ACTIVE RELATIONSHIP STAGE MANDATE'));
  assert.ok(!prompt.includes('four to seven'));
  assert.ok(prompt.includes('General persona traits and preferences are background'));
  assert.match(prompt, /REVIEWED WRITING EXAMPLES/);
  const publicView = await ok(`${prefix}/trials/${trial.id}`, 'GET', null, token);
  const visible = publicView.batches.at(-1);
  assert.equal(visible.writingPreferences, undefined);
  for (const c of visible.candidates) for (const key of ['promptArm', 'approach', 'move', 'prompt', 'options']) assert.equal(c[key], undefined);
  const ids = batch.candidates.filter(c => c.promptArm === 'character-v1').slice(0, 2).map(c => c.id);
  trial = await ok(`${prefix}/trials/${trial.id}/batches/blind-one/feedback`, 'PUT', { revision: trial.revision, accepted: ids, favorite: ids[0] }, token);
  assert.equal(trial.batches.at(-1).feedback.rejected.length, 8);
  assert.deepEqual(trial.batches[0].feedback, previousFeedback);
  const exported = await ok(`${prefix}/labs/${lab.id}/export`, 'GET', null, token);
  assert.ok(exported.trials.find(t => t.id === trial.id).batches.at(-1).candidates.every(c => c.promptArm && c.prompt));
  fail = true;
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'blind-failure', mode: 'comparison' }, token);
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  assert.equal(trial.batches.at(-1).candidates.length, 1);
  assert.equal(trial.batches.at(-1).candidates[0].status, 'failed');
  fail = false;
});

test('provider errors remain unrateable and interrupted leases recover without silently regenerating', async () => {
  fail = true;
  await ok(`${prefix}/trials/${trial.id}/batches`, 'POST', { revision: trial.revision, requestId: 'failed-batch' }, token);
  await service.jobs.get(trial.id);
  trial = await service.repo.trial(trial.id, first.user.id);
  assert.equal(trial.batches.at(-1).candidates[0].status, 'failed');
  assert.equal(trial.batches.at(-1).candidates.length, 1);
  assert.equal((await api(`${prefix}/trials/${trial.id}/batches/failed-batch/feedback`, 'PUT', { revision: trial.revision, accepted: [], noneFit: true }, token)).status, 400);
  await getDatabase().prepare("UPDATE response_lab_trials SET status='generating',lease_until=0 WHERE id=?").run(trial.id);
  const callCount = calls.length;
  const reloaded = await ok(`${prefix}/trials/${trial.id}`, 'GET', null, token);
  assert.equal(reloaded.status, 'interrupted');
  assert.equal(reloaded.revision, trial.revision + 1);
  assert.deepEqual(reloaded.batches.map(batch => batch.feedback), trial.batches.map(batch => batch.feedback));
  assert.equal(calls.length, callCount);
  assert.equal((await api(`${prefix}/labs/${lab.id}`, 'DELETE', null, second.token)).status, 404);
  await ok(`${prefix}/labs/${lab.id}`, 'DELETE', null, token);
  assert.equal((await api(`${prefix}/labs/${lab.id}`, 'GET', null, token)).status, 404);
});

test('lab Gemini model override does not silently switch models after an upstream error', async t => {
  const { GeminiProvider } = await import('../backend/ai/providers/gemini.js');
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture-no-network';
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    return new Response(JSON.stringify({ error: { code: 404, message: 'Fixture model unavailable', status: 'NOT_FOUND' } }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
    });
  });
  await assert.rejects(new GeminiProvider().generateReply(lab.snapshot.character, 'Hello', [], {
    modelOverride: 'fixture-pinned-model', timeout: 45000, requireComplete: true
  }));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /fixture-pinned-model/);
});

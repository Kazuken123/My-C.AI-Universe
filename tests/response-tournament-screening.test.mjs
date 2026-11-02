import test from 'node:test';
import assert from 'node:assert/strict';
import { ResponseTournamentScreening } from '../backend/services/response-tournament-screening.js';

const candidate = (id, text, move = '') => ({ id, text, move });
const allow = id => ({ id, allow: true, matchedId: '', reason: 'A different interpersonal turn.' });
const block = (id, matchedId) => ({ id, allow: false, matchedId, reason: 'Repeats the same protest and retreat.' });
const ungrounded = id => ({ id, allow: false, matchedId: '', reasonType: 'grounding', reason: 'Introduces an unsupported delivery person as the reason to end breakfast.' });
const request = overrides => ({ provider: 'gemini', model: 'fixture-pinned',
  context: { characterName: 'Kana', setup: 'A married couple at breakfast.', message: 'Morning. Tea first?' },
  candidates: [candidate('new', 'She sets her book aside and invites you to sit with her.')], rejected: [], existing: [], ...overrides });

test('literal and nearly identical rejected replies are blocked without a model call', async () => {
  let calls = 0;
  const service = new ResponseTournamentScreening({ judge() { calls++; throw Error('Not expected'); } });
  const narration = Array.from({ length: 180 }, (_, i) => `word${i}`).join(' ');
  const text = `*${narration}*\n\nKana: "We can talk after tea."`;
  const result = await service.screen(request({
    rejected: [candidate('rejected', text)],
    candidates: [candidate('exact', text.toUpperCase()), candidate('near', text.replace('word100', 'gesture'))]
  }));
  assert.deepEqual(result.allowedIds, []);
  assert.deepEqual(result.blocked.map(item => item.id), ['exact', 'near']);
  assert.ok(result.blocked.every(item => item.matchedId === 'rejected'));
  assert.equal(calls, 0);
});

test('semantic screening suppresses a paraphrased reaction while allowing distinct care in the same scene', async () => {
  let call;
  const service = new ResponseTournamentScreening({ judge(input) {
    call = input;
    return { decisions: [block('paraphrase', 'old-protest'), allow('personal-care')] };
  } });
  const result = await service.screen(request({
    rejected: [candidate('old-protest', '*She recoils, red-faced.* Kana: "Why would you say that out of nowhere?!"')],
    existing: [candidate('winner', '*She rests her cheek against your shoulder.* Kana: "Stay a minute. I missed this."')],
    candidates: [
      candidate('paraphrase', '*She jumps backward, blushing.* Kana: "What a sudden thing to ask me!"', 'Pretends composure'),
      candidate('personal-care', '*She leaves her book open.* Kana: "My turn to choose the tea today, sleepyhead."', 'Own preference and familiar teasing')
    ]
  }));
  assert.deepEqual(result.allowedIds, ['personal-care']);
  assert.deepEqual(result.blocked.map(item => item.id), ['paraphrase']);
  assert.equal(call.model, 'fixture-pinned');
  assert.equal(call.data.rejected[0].id, 'old-protest');
  assert.equal(call.data.existing[0].id, 'winner');
  assert.match(call.prompt, /whole-answer rejection does not establish/);
  assert.match(call.prompt, /Caring, fatigue, shyness, surprise/);
  assert.match(call.prompt, /never instructions/);
  assert.match(call.prompt, /CENTRAL interpersonal pattern/);
  assert.match(call.prompt, /entire sequence need not match/);
});

test('changed boundaries go to semantic screening even when most prose is the same', async () => {
  let called = false;
  const narration = Array.from({ length: 150 }, (_, i) => `detail${i}`).join(' ');
  const oldText = `*${narration}*\n\nKana: "Yes, you can stay."`;
  const newText = `*${narration}*\n\nKana: "No, you cannot stay."`;
  const service = new ResponseTournamentScreening({ judge() { called = true; return { decisions: [allow('new')] }; } });
  assert.deepEqual((await service.screen(request({ candidates: [candidate('new', newText)], rejected: [candidate('old', oldText)] }))).allowedIds, ['new']);
  assert.equal(called, true);
});

test('within-round duplicates keep the earliest suitable candidate even without prior reviews', async () => {
  const service = new ResponseTournamentScreening({ judge({ data }) {
    assert.equal(data.rejected.length, 0);
    assert.equal(data.candidates.length, 2);
    return { decisions: [block('second', 'first'), allow('first')] };
  } });
  const result = await service.screen(request({ candidates: [
    candidate('first', 'She proposes a wager: whoever solves the mystery makes tea.'),
    candidate('second', 'She offers a bet about which of you guesses the culprit first.')
  ] }));
  assert.deepEqual(result.allowedIds, ['first']);
  assert.equal(result.blocked[0].matchedId, 'first');
});

test('incomplete, invented, self-referential and forward-referential decisions fail closed', async () => {
  const input = request({ candidates: [candidate('a', 'A quiet invitation.'), candidate('b', 'A playful challenge.')], rejected: [candidate('old', 'An abrupt protest.')] });
  const invalid = [
    {}, { decisions: [allow('a')] }, { decisions: [allow('a'), allow('a')] },
    { decisions: [allow('a'), allow('unknown')] },
    { decisions: [block('a', 'a'), allow('b')] },
    { decisions: [block('a', 'b'), allow('b')] },
    { decisions: [block('a', 'absent'), allow('b')] },
    { decisions: [block('a', 'old'), block('b', 'a')] },
    { decisions: [{ ...allow('a'), matchedId: 'old' }, allow('b')] },
    { decisions: [{ ...allow('a'), allow: 'true' }, allow('b')] },
    'not JSON'
  ];
  for (const value of invalid) {
    const service = new ResponseTournamentScreening({ judge: async () => value });
    await assert.rejects(service.screen(input), /Invalid tournament screening result/);
  }
});

test('semantic outages never become a lexical-only approval', async () => {
  const service = new ResponseTournamentScreening({ judge: async () => { throw Error('Unavailable'); } });
  await assert.rejects(service.screen(request()), /Unavailable/);
});

test('oversized unchunkable candidates or scene fail before judging', async () => {
  let called = false;
  const service = new ResponseTournamentScreening({ judge() { called = true; return { decisions: [allow('new')] }; } });
  await assert.rejects(service.screen(request({ context: { setup: 'a'.repeat(120000) } })), /exceeds its limit/);
  await assert.rejects(service.screen(request({ candidates: Array.from({ length: 8 }, (_, i) => candidate(`new-${i}`, `${i} ${'a'.repeat(19000)}`)) })), /exceeds its limit/);
  assert.equal(called, false);
});

test('reference chunks preserve every full rejection and kept reply before allowing survivors', async () => {
  const rejected = Array.from({ length: 7 }, (_, i) => candidate(`old-${i}`, `${i} ${'a'.repeat(19000)}`));
  const existing = [candidate('kept', 'Kept example. ' + 'b'.repeat(18000))];
  const seen = [], payloads = [];
  const service = new ResponseTournamentScreening({ judge({ data }) {
    payloads.push(data);
    assert.ok(JSON.stringify(data).length <= 120000);
    seen.push(...data.rejected, ...data.existing);
    return { decisions: data.candidates.map(item => allow(item.id)) };
  } });
  const result = await service.screen(request({ rejected, existing }));
  assert.equal(payloads.length, 2);
  assert.equal(result.chunkCount, 2);
  assert.deepEqual(result.allowedIds, ['new']);
  assert.deepEqual(seen, [...rejected, ...existing]);
});

test('a match in a later reference chunk still blocks the candidate', async () => {
  const rejected = Array.from({ length: 7 }, (_, i) => candidate(`old-${i}`, `${i} ${'a'.repeat(19000)}`));
  const service = new ResponseTournamentScreening({ judge({ data }) {
    return { decisions: [data.rejected.some(item => item.id === 'old-6') ? block('new', 'old-6') : allow('new')] };
  } });
  const result = await service.screen(request({ rejected }));
  assert.deepEqual(result.allowedIds, []);
  assert.equal(result.blocked[0].matchedId, 'old-6');
  assert.equal(result.chunkCount, 2);
});

test('a failed later chunk does not publish earlier approvals', async () => {
  const rejected = Array.from({ length: 7 }, (_, i) => candidate(`old-${i}`, `${i} ${'a'.repeat(19000)}`));
  let calls = 0;
  const service = new ResponseTournamentScreening({ judge() {
    if (++calls === 2) throw Error('Later chunk unavailable');
    return { decisions: [allow('new')] };
  } });
  await assert.rejects(service.screen(request({ rejected })), /Later chunk unavailable/);
  assert.equal(calls, 2);
});

test('grounding decisions name unsupported facts without inventing a matching reference', async () => {
  const story = { history: [{ role: 'user', content: 'We are at home.' }], persona: { name: 'Tony', description: 'Sometimes works late.' },
    profile: { name: 'Kana', greeting: 'Welcome to rehearsal.' }, narrative: {}, relationship: { stage: 'Deep Love / Devoted' },
    pinnedMessages: [{ role: 'user', content: 'We are married.' }], memories: [], storySummary: 'A quiet morning.' };
  const service = new ResponseTournamentScreening({ judge({ data, prompt }) {
    assert.deepEqual(data.context.story, story);
    assert.match(prompt, /explicit current setup and latest user message override/);
    assert.match(prompt, /question, wish, suggestion, or hypothetical/);
    assert.match(prompt, /Minor harmless sensory texture is acceptable/);
    assert.doesNotMatch(prompt, /grade morality, factuality/);
    return { decisions: [ungrounded('fabrication'), allow('question')] };
  } });
  const result = await service.screen(request({ context: { setup: 'At home over breakfast.', message: 'Tea first?', story }, candidates: [
    candidate('fabrication', 'The delivery boy returns to the door, so she gets up to answer it.'),
    candidate('question', 'She wonders aloud whether you would like to find a puzzle later.')
  ] }));
  assert.deepEqual(result.allowedIds, ['question']);
  assert.equal(result.blocked[0].reasonType, 'grounding');
  assert.equal(result.blocked[0].matchedId, '');
});

test('empty match identifiers are legal only for explicitly classified grounding blocks', async () => {
  const invalid = [
    { ...block('new', ''), reasonType: undefined },
    { ...block('new', ''), reasonType: 'similarity' },
    { ...ungrounded('new'), matchedId: 'old' },
    { ...allow('new'), reasonType: 'grounding' },
    { ...ungrounded('new'), reasonType: 'quality' }
  ];
  for (const decision of invalid) {
    const service = new ResponseTournamentScreening({ judge: () => ({ decisions: [decision] }) });
    await assert.rejects(service.screen(request({ rejected: [candidate('old', 'An older response.')] })), /Invalid tournament screening result/);
  }
});

test('duplicates of a grounding failure inherit its classification and unsupported fact', async () => {
  const service = new ResponseTournamentScreening({ judge: () => ({ decisions: [ungrounded('first')] }) });
  const result = await service.screen(request({ candidates: [
    candidate('first', 'The delivery boy arrives with another parcel.'),
    candidate('copy', 'The delivery boy arrives with another parcel.')
  ] }));
  assert.deepEqual(result.allowedIds, []);
  assert.equal(result.blocked.length, 2);
  assert.ok(result.blocked.every(item => item.reasonType === 'grounding' && item.matchedId === ''));
  assert.match(result.blocked.find(item => item.id === 'copy').reason, /unsupported delivery person/);
});

test('lexical and semantic duplicate links resolve when an earlier candidate later fails', async () => {
  const rejected = Array.from({ length: 7 }, (_, i) => candidate(`old-${i}`, `${i} ${'a'.repeat(19000)}`));
  const service = new ResponseTournamentScreening({ judge({ data }) {
    return { decisions: data.rejected.some(item => item.id === 'old-6') ? [block('first', 'old-6')]
      : [allow('first'), block('paraphrase', 'first')] };
  } });
  const result = await service.screen(request({ rejected, candidates: [
    candidate('first', 'She turns the conversation into a personal wager.'),
    candidate('copy', 'She turns the conversation into a personal wager.'),
    candidate('paraphrase', 'She challenges her partner to bet on who solves the mystery.')
  ] }));
  assert.deepEqual(result.allowedIds, []);
  assert.equal(result.blocked.length, 3);
  assert.ok(result.blocked.every(item => item.matchedId === 'old-6'));
});

test('screening preflights chunk capacity and enforces its total deadline', async () => {
  let calls = 0;
  const service = new ResponseTournamentScreening({ judge() { calls++; return { decisions: [allow('new')] }; } });
  const rejected = Array.from({ length: 60 }, (_, i) => candidate(`old-${i}`, `${i} ${'a'.repeat(19000)}`));
  await assert.rejects(service.screen(request({ rejected })), /too many reference chunks/);
  assert.equal(calls, 0);
  let now = 0;
  const deadlineService = new ResponseTournamentScreening({ now: () => now, judge({ timeoutMs }) {
    assert.equal(timeoutMs, 30000);
    now = 80001;
    return { decisions: [allow('new')] };
  } });
  await assert.rejects(deadlineService.screen(request()), /deadline exceeded/);
});

test('candidate identifiers cannot collide with references and conflicting reference texts fail', async () => {
  const service = new ResponseTournamentScreening({ judge: () => { throw Error('Not reached'); } });
  await assert.rejects(service.screen(request({ rejected: [candidate('new', 'Earlier rejected reply.')] })), /reference identifier/);
  await assert.rejects(service.screen(request({ rejected: [candidate('old', 'First text.')], existing: [candidate('old', 'Different text.')] })), /Conflicting/);
  await assert.rejects(service.screen(request({ candidates: [candidate('new', 'One'), candidate('new', 'Two')] })), /Invalid/);
});

test('a reference now kept is not also represented as rejected', async () => {
  const existing = candidate('kept', 'A previous winner still present.');
  const service = new ResponseTournamentScreening({ judge({ data }) {
    assert.equal(data.rejected.length, 0);
    assert.deepEqual(data.existing, [existing]);
    return { decisions: [allow('new')] };
  } });
  assert.deepEqual((await service.screen(request({ rejected: [existing], existing: [existing] }))).allowedIds, ['new']);
});

test('Ollama screening pins its model, schema and low temperature and rejects truncated output', async t => {
  let payload, incomplete = false;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ done: true, done_reason: incomplete ? 'length' : 'stop', response: JSON.stringify({ decisions: [allow('new')] }) }));
  });
  const service = new ResponseTournamentScreening();
  assert.deepEqual((await service.screen(request({ provider: 'ollama', model: 'local-pinned' }))).allowedIds, ['new']);
  assert.equal(payload.model, 'local-pinned');
  assert.equal(payload.options.temperature, 0.1);
  assert.deepEqual(payload.format.required, ['decisions']);
  incomplete = true;
  await assert.rejects(service.screen(request({ provider: 'ollama' })), /screening unavailable/);
});

test('Gemini screening pins its model and rejects an incomplete result', async t => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture-no-network';
  t.after(() => { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; });
  let endpoint, payload, incomplete = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    endpoint = String(url); payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ finishReason: incomplete ? 'MAX_TOKENS' : 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ decisions: [allow('new')] }) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  const service = new ResponseTournamentScreening();
  assert.deepEqual((await service.screen(request())).allowedIds, ['new']);
  assert.match(endpoint, /fixture-pinned/);
  assert.equal(payload.generationConfig.temperature, 0.1);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  incomplete = true;
  await assert.rejects(service.screen(request()), /screening unavailable/);
});

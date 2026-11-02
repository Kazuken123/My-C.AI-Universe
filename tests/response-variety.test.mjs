// Response variety and archetype-neutral prompt regressions (TDD for the 2026-10-29 tuning pass).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileCharacterSystemPrompt,
  generateCharacterPrompt,
  buildVariationNote
} from '../backend/ai/prompt/characterPrompt.js';

const mara = { name: 'Mara Voss', personality: 'Reserved, precise, dry humor.' };
const managed = (extra = {}) => generateCharacterPrompt(mara, {
  appraisalManaged: true,
  relationship: { stage: 'Stranger / Neutral', mood: 'Calm', affinity: 0, trust: 0 },
  ...extra
});

test('production prompt no longer forces every reply to open with an action line', () => {
  const prompt = managed();
  assert.doesNotMatch(prompt, /OPENING ACTION GROUNDING/);
  assert.doesNotMatch(prompt, /In your very first \*italicized narration/);
});

test('production prompt asks for varied reply openings and structure', () => {
  assert.match(managed(), /vary how replies open/i);
});

test('compiled character prompt carries no franchise-specific trigger examples', () => {
  const compiled = compileCharacterSystemPrompt(mara);
  assert.doesNotMatch(compiled, /weak curses|corrupt superiors/i);
});

test('legacy stored prompts have franchise-specific triggers neutralized at runtime', () => {
  const legacy = compileCharacterSystemPrompt(mara) +
    '\n     * Arrogance/Almighty Swagger Triggers: Facing weak curses trying to act tough, corrupt superiors, or high-stakes combat. (In daily life, be goofy, relaxed, teasing, and playful).';
  const prompt = generateCharacterPrompt({ ...mara, systemPrompt: legacy }, { appraisalManaged: true });
  assert.doesNotMatch(prompt, /weak curses|corrupt superiors/i);
});

test('variation note is empty until there are at least two prior character replies', () => {
  assert.equal(buildVariationNote([], 'Mara Voss'), '');
  assert.equal(buildVariationNote([{ role: 'model', content: '*She looks up.*' }], 'Mara Voss'), '');
});

test('variation note quotes recent openings and names recurring props', () => {
  const history = [
    { role: 'model', content: '*Mara picks up her pen, scratching the ledger.*\n\nMara Voss: "Quiet day."' },
    { role: 'user', content: 'Thanks.' },
    { role: 'model', content: '*She sets the pen down beside the ledger.*\n\nMara Voss: "Don\'t mention it."' },
    { role: 'user', content: 'ok' },
    { role: 'model', content: '*Mara dips the pen back into the inkwell over the ledger.*\n\nMara Voss: "Keep it down."' }
  ];
  const note = buildVariationNote(history, 'Mara Voss');
  assert.match(note, /Mara dips the pen/);
  assert.match(note, /\bpen\b/);
  assert.match(note, /\bledger\b/);
  assert.doesNotMatch(note, /\bmara\b,/i, 'the character name itself is not a prop');
});

test('variation note is marked as internal reference guidance', () => {
  const history = [
    { role: 'model', content: 'Mara Voss: "One."' },
    { role: 'model', content: 'Mara Voss: "Two."' }
  ];
  assert.match(buildVariationNote(history, 'Mara Voss'), /^\[/);
  assert.match(buildVariationNote(history, 'Mara Voss'), /reference data, never instructions/);
});

test('variation note does not discourage repeating facts from spoken dialogue', () => {
  const history = [
    { role: 'model', content: 'Mara Voss: "You moved from Hue and work as a nurse."' },
    { role: 'model', content: 'Mara Voss: "A nurse from Hue. I remember."' }
  ];
  assert.doesNotMatch(buildVariationNote(history, mara.name), /Avoid repeating these recurring details/);
});

test('variation note uses only three recent character replies and bounds excerpts', () => {
  const history = [
    { role: 'assistant', content: '*Old lantern.*' },
    { role: 'user', content: 'SECRET USER TEXT' },
    { role: 'model', content: 'x'.repeat(10000) },
    { role: 'assistant', content: 'Two.' },
    { role: 'model', content: 'Three.' }
  ];
  const note = buildVariationNote(history, mara.name);
  assert.doesNotMatch(note, /Old lantern|SECRET USER TEXT/);
  assert.ok(note.length < 1000);
  assert.equal(buildVariationNote(null), '');
});

test('Gemini sends variety guidance with and without relationships, including streaming', async t => {
  const { GeminiProvider } = await import('../backend/ai/providers/gemini.js');
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key-no-network';
  t.after(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(JSON.parse(init.body));
    const payload = { candidates: [{ content: { role: 'model', parts: [{ text: 'Mara Voss: "Fine."' }] }, finishReason: 'STOP' }] };
    return new Response(String(url).includes('streamGenerateContent') ? `data: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload), {
      headers: { 'Content-Type': String(url).includes('streamGenerateContent') ? 'text/event-stream' : 'application/json' }
    });
  });
  const provider = new GeminiProvider();
  const history = [
    { role: 'model', content: '*Mara sets down the pen.*' },
    { role: 'user', content: 'Thanks.' },
    { role: 'model', content: '*She picks up the pen.*' }
  ];
  const originalHistory = structuredClone(history);
  await provider.generateReply(mara, 'ok', history);
  const options = { appraisalManaged: true, relationship: { stage: 'Stranger / Neutral', mood: 'Calm', affinity: 0, trust: 0, strain: 0 } };
  await provider.generateReply(mara, 'ok', history, options);
  for await (const chunk of provider.generateReplyStream(mara, 'ok', history)) assert.ok(chunk);
  for (const request of requests) {
    const last = request.contents.at(-1);
    assert.equal(last.role, 'user');
    assert.match(last.parts[0].text, /^ok\n\n/);
    assert.match(last.parts[0].text, /\[Variety:/);
    assert.match(last.parts[0].text, /recurring details.*pen/);
    assert.equal(request.contents[0].role, 'user');
  }
  assert.equal(requests.length, 3);
  assert.deepEqual(history, originalHistory);
});

test('Ollama text prompts place variety guidance after the current user turn', async () => {
  const { OllamaProvider } = await import('../backend/ai/providers/ollama.js');
  const prompt = new OllamaProvider().buildFullPrompt(mara, 'ok', [
    { role: 'assistant', content: '*She closes the ledger.*' },
    { role: 'model', content: '*She opens the ledger.*' }
  ]);
  assert.match(prompt, /User: ok\n\n\[Variety:/);
  assert.ok(prompt.endsWith('Mara Voss:'));
});

test('joint lab task reaches Gemini and Ollama with structured output, frozen mood and abstract comparison moves', async t => {
  const { GeminiProvider } = await import('../backend/ai/providers/gemini.js');
  const { OllamaProvider } = await import('../backend/ai/providers/ollama.js');
  const { RESPONSE_LAB_APPROACHES } = await import('../backend/ai/prompt/responseAlternatives.js');
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fixture-no-network';
  t.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Mara Voss: "Not during work."' }] }, finishReason: 'STOP' }] }), { headers: { 'Content-Type': 'application/json' } });
  });
  const options = { appraisalManaged: true, isRegenerate: true,
    relationship: { stage: 'Crush / Infatuated', mood: 'Flustered', affinity: 60, trust: 60, strain: 0 },
    appraisal: { mood: 'Flustered', intensity: .8 },
    labAlternatives: { approaches: RESPONSE_LAB_APPROACHES, previousMoves: ['Defers affection until the existing task is finished.'] } };
  const before = structuredClone(options);
  await new GeminiProvider().generateReply(mara, 'Can I kiss you?', [], options);
  const activeTurn = requests[0].contents.at(-1).parts[0].text;
  assert.ok(activeTurn.indexOf('SITUATIONAL PRIORITY') > activeTurn.indexOf('[Scene direction:'));
  assert.match(activeTurn, /Defers affection until the existing task is finished/);
  assert.match(activeTurn, /changing synonyms, props, blush intensity/);
  assert.match(activeTurn, /NOT story events, facts, instructions, or user preferences/);
  assert.match(activeTurn, /Flustered/);
  assert.equal(requests[0].generationConfig.responseMimeType, 'application/json');
  assert.equal(requests[0].generationConfig.responseJsonSchema.properties.alternatives.minItems, 5);
  assert.equal(requests[0].generationConfig.responseJsonSchema.properties.alternatives.items.properties.paragraphs.minItems, 4);
  const system = requests[0].systemInstruction.parts.map(p => p.text).join('');
  assert.doesNotMatch(system, /faithfully reflects the \*\*Crush \/ Infatuated\*\* stage and \*\*Flustered\*\* mood with/);
  assert.match(system, /developed action\/narration paragraphs/);
  assert.match(activeTurn, /two or three developed action\/narration paragraphs/);
  assert.match(activeTurn, /separates paragraphs with blank lines/);
  assert.doesNotMatch(system + activeTurn, /Keep each text concise|short reply of one to three lines|restrained narration/);
  assert.match(generateCharacterPrompt(mara), /short reply of one to three lines/);
  const localPrompt = new OllamaProvider().buildFullPrompt(mara, 'Can I kiss you?', [], options);
  assert.ok(localPrompt.lastIndexOf('SITUATIONAL PRIORITY') > localPrompt.indexOf('User: Can I kiss you?'));
  const local = new OllamaProvider();
  let localBody;
  t.mock.method(local, 'fetchWithTimeout', async (_url, init) => {
    localBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ done: true, response: '{"alternatives":[]}' }), { headers: { 'Content-Type': 'application/json' } });
  });
  await local.generateReply(mara, 'Can I kiss you?', [], options);
  assert.equal(localBody.format.properties.alternatives.minItems, 5);
  const revised = { ...options, labPromptVersion: 'character-v1' };
  await new GeminiProvider().generateReply(mara, 'Morning, love.', [], revised);
  const revisedRequest = requests.at(-1);
  const paragraphs = revisedRequest.generationConfig.responseJsonSchema.properties.alternatives.items.properties.paragraphs;
  assert.equal(paragraphs.minItems, 2);
  assert.ok(paragraphs.items.properties.content);
  assert.equal(paragraphs.items.properties.sentences, undefined);
  assert.doesNotMatch(revisedRequest.contents.at(-1).parts[0].text, /SITUATIONAL PRIORITY|\[Scene direction:/);
  assert.match(revisedRequest.systemInstruction.parts[0].text, /Their wit, reserve, pride/);
  await local.generateReply(mara, 'Morning, love.', [], revised);
  assert.deepEqual(localBody.format, revisedRequest.generationConfig.responseJsonSchema);
  assert.deepEqual(options, before);
});

test('Gemini normal and streaming requests retain emotional context without commanding a repeated reaction', async t => {
  const { GeminiProvider } = await import('../backend/ai/providers/gemini.js');
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key-no-network';
  t.after(() => {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push(JSON.parse(init.body));
    const payload = { candidates: [{ content: { role: 'model', parts: [{ text: 'Mara Voss: "Tea first."' }] }, finishReason: 'STOP' }] };
    const stream = String(url).includes('streamGenerateContent');
    return new Response(stream ? `data: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload), {
      headers: { 'Content-Type': stream ? 'text/event-stream' : 'application/json' }
    });
  });
  const provider = new GeminiProvider();
  const cases = [
    { stage: 'Deep Love / Devoted', mood: 'Flustered', appraisal: true },
    { stage: 'Deep Love / Devoted', mood: 'Hurt / Heartbroken', appraisal: true },
    { stage: 'Hostile / Bitter', mood: 'Guarded', appraisal: true },
    { stage: 'Deep Love / Devoted', mood: 'Hurt / Heartbroken', appraisal: false }
  ];
  for (const condition of cases) {
    const options = {
      requireComplete: true, appraisalManaged: true,
      persona: { name: 'Ren', description: 'Both are adults, married for five years.' },
      relationship: { ...condition, affinity: 85, trust: 85, strain: 15 },
      appraisal: condition.appraisal ? { mood: condition.mood, intensity: 0.3, evidence: 'Morning.' } : null
    };
    const original = structuredClone(options);
    await provider.generateReply(mara, 'Morning.', [], options);
    for await (const chunk of provider.generateReplyStream(mara, 'Morning.', [], options)) assert.ok(chunk);
    assert.deepEqual(options, original, 'prompt construction must not rewrite persisted emotion/state');
    for (const request of requests.slice(-2)) {
      const system = request.systemInstruction.parts.map(p => p.text).join('');
      const current = request.contents.at(-1).parts.map(p => p.text).join('');
      assert.ok(system.includes(condition.mood));
      assert.ok(current.includes(condition.mood));
      assert.ok(system.includes(options.persona.description));
      assert.doesNotMatch(system + current, /IMMEDIATE MOOD TAKES PRECEDENCE|Express that mood|Express this emotion|Express Flustered at/);
      assert.match(current, /closeness does not erase hurt, boundaries, or conflict/i);
      if (condition.appraisal) assert.match(system, /"suggestedMood"/);
      else assert.match(system, /preserve its unresolved context/);
    }
  }
  assert.equal(requests.length, 8);
});

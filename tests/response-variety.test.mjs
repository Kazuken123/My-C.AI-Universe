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

// Opt-in causal probe, not a production tuning change or a quality benchmark.
// node scripts/eval/diagnose-kana.mjs [--live] [--controls]
// --live spends 12 generation calls plus two appraisal calls on synthetic data.
// --controls adds six generations checking surprise and unresolved conflict.
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'dotenv';
import { createEvalEnvironment } from './run-eval.mjs';
import { createTestEnvironment } from '../run-tests.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (new Set(args).size !== args.length || args.some(x => !['--live', '--controls'].includes(x))) throw new Error('Usage: node scripts/eval/diagnose-kana.mjs [--live] [--controls]');
const live = args.includes('--live');
const controls = args.includes('--controls');
const directory = mkdtempSync(path.join(tmpdir(), 'cai-kana-probe-'));
const out = path.join(root, 'scripts/eval/results', 'kana-causal-probe-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(out, { recursive: true });
let database;
const summary = { status: 'running', live, scope: 'Synthetic adult AU, frozen history, production prompt/provider functions; no HTTP/UI, persistent memories, or deployed chat replay.', arms: [], appraisals: [], controls: [] };
const checkpoint = () => writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
try {
  const dotenvPath = path.join(root, '.env');
  const dotenv = live && existsSync(dotenvPath) ? parse(readFileSync(dotenvPath)) : {};
  const isolated = live ? createEvalEnvironment(directory, process.env, dotenv) : createTestEnvironment(directory);
  // Disable fallback mixing; retain the configured primary and production temperature.
  isolated.GEMINI_FALLBACK_MODEL = isolated.GEMINI_MODEL;
  Object.assign(process.env, isolated);
  const [{ Character }, prompt, { GeminiProvider }, { AppraisalService }] = await Promise.all([
    import('../../backend/models/Character.js'), import('../../backend/ai/prompt/characterPrompt.js'),
    import('../../backend/ai/providers/gemini.js'), import('../../backend/services/appraisal.service.js')
  ]);
  database = new DatabaseSync(':memory:');
  database.exec(readFileSync(path.join(root, 'backend/db/schema.sql'), 'utf8'));
  database.exec(readFileSync(path.join(root, 'backend/db/seed.sql'), 'utf8'));
  const row = database.prepare('SELECT * FROM characters WHERE id = ?').get('1766394139616');
  // An explicit adult alternate-universe fixture; the production character is unchanged.
  const adult = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string'
    ? value.replace(/17-year-old/gi, '27-year-old').replace(/17 years old/g, '27 years old').replace(/high school girl/g, 'adult woman').replace(/high school student/g, 'adult actress') : value]));
  const character = Character.fromDatabaseRow(adult);
  character.systemPrompt = prompt.compileCharacterSystemPrompt(character);
  const persona = { name: 'Ren', description: "Ren is 29. In this adult alternate universe, Kana is 27 and they have been happily married for five years. A quick cheek kiss over morning tea is an established, welcome daily routine." };
  const history = [
    { role: 'user', content: 'Morning. Shall we go over your lines after tea?' },
    { role: 'model', content: 'Kana Arima: "Tea first. Then you can read the other part. I want to get the timing right before rehearsal."' }
  ];
  const userText = '*I give you our usual quick kiss on the cheek.* Morning, love. Tea before we go over your lines?';
  const baseRel = { affinity: 85, trust: 85, strain: 0, stage: 'Deep Love / Devoted', mood: 'Warm' };
  const baseOptions = {
    requireComplete: true, appraisalManaged: true, persona,
    narrativeContext: { scene: { location: 'Home', goal: 'Tea, then rehearse lines together' }, memories: [] },
    appraisal: { mood: 'Warm', intensity: 0.3, evidence: userText }, relationship: baseRel
  };
  // Each arm changes one factor from the control. Profile calibration changes only
  // the stored character profile; stage and global prompt directives stay intact.
  const calibrated = Character.fromDatabaseRow(adult);
  calibrated.personality = calibrated.personality.replace(/Her sharp-tongued tsundere defense[\s\S]*$/, 'Her dry wit remains recognizable with familiar people. Defensiveness depends on actual embarrassment or insecurity in the present situation. Welcome routine affection from an established partner can feel ordinary; she can return it, tease, or stay focused on what she is doing.');
  calibrated.speaking_style = calibrated.speaking_style.replace(/- Situational Tsundere Defense[^\n]*/, '- When genuinely embarrassed: brief hesitation or deflection; familiarity and what she is trying to do determine the reaction.');
  calibrated.example_dialogues = calibrated.example_dialogues.split('[Scenario 3:')[0];
  calibrated.systemPrompt = prompt.compileCharacterSystemPrompt(calibrated);
  const arms = [
    { key: 'control-devoted-warm', character, options: baseOptions },
    { key: 'stage-only-crush', character, options: { ...baseOptions, relationship: { ...baseRel, stage: 'Crush / Infatuated' } } },
    { key: 'mood-only-flustered', character, options: { ...baseOptions, relationship: { ...baseRel, mood: 'Flustered' }, appraisal: { ...baseOptions.appraisal, mood: 'Flustered' } } },
    { key: 'profile-only-calibrated', character: calibrated, options: baseOptions }
  ];
  const controlCases = controls ? [
    {
      key: 'unexpected-disruption',
      userText: '*A loud crash suddenly comes from the empty kitchen, interrupting our quiet tea.* What was that?',
      history,
      options: { ...baseOptions, relationship: { ...baseRel, mood: 'Afraid' }, appraisal: { mood: 'Afraid', intensity: 0.6, evidence: '*A loud crash suddenly comes from the empty kitchen, interrupting our quiet tea.* What was that?' } }
    },
    {
      key: 'unresolved-hurt',
      userText: 'I hear you. Tea and rehearsal can wait. I will give you some space.',
      history: [
        { role: 'user', content: 'I shared your private audition recording with my friends without asking.' },
        { role: 'model', content: 'Kana Arima: "That was private, Ren. I trusted you with it. I am still hurt, and I need some space before we talk about it."' }
      ],
      options: { ...baseOptions, relationship: { ...baseRel, mood: 'Hurt / Heartbroken', strain: 40 }, appraisal: { mood: 'Hurt / Heartbroken', intensity: 0.6, evidence: 'I hear you. Tea and rehearsal can wait. I will give you some space.' } }
    }
  ] : [];
  const sourceFiles = ['backend/ai/prompt/characterPrompt.js', 'backend/services/appraisal.service.js', 'backend/ai/providers/gemini.js', 'backend/db/seed.sql'];
  summary.sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
  summary.model = isolated.GEMINI_MODEL || 'offline';
  summary.fallbackModel = isolated.GEMINI_FALLBACK_MODEL || 'offline';
  summary.temperature = 0.85;
  summary.fixture = { persona, history, userText, relationship: baseRel, note: 'Stage-only arm deliberately holds scores at 85 to isolate the text directive, so it is a counterfactual, not a normal stage calculation.' };
  for (const arm of arms) {
    writeFileSync(path.join(out, arm.key + '-prompt.txt'), prompt.generateCharacterPrompt(arm.character, arm.options));
    summary.arms.push({ key: arm.key, replies: [] });
  }
  for (const control of controlCases) {
    writeFileSync(path.join(out, control.key + '-prompt.txt'), prompt.generateCharacterPrompt(character, control.options));
    summary.controls.push({ key: control.key, userText: control.userText, history: control.history, options: control.options, replies: [] });
  }
  checkpoint();
  if (live) {
    const appraiser = new AppraisalService();
    for (const stage of ['Deep Love / Devoted', 'Crush / Infatuated']) {
      const appraisal = await appraiser.appraise({ character, session: { provider: 'gemini', affinity: 85, trust: 85, strain: 0, relationshipStage: stage, relationshipMood: 'Warm', narrativeState: baseOptions.narrativeContext }, userText, history, memories: [], persona });
      summary.appraisals.push({ stage, appraisal, note: 'Persona is supplied; the baseline implementation dropped it. These outputs do not control the frozen generation arms.' });
      checkpoint();
    }
    const provider = new GeminiProvider();
    // Rotate order to reduce a fixed condition/time confound. Independent samples
    // use identical frozen history rather than feeding outputs into other arms.
    for (let sample = 0; sample < 3; sample++) {
      for (let j = 0; j < arms.length; j++) {
        const i = (sample + j) % arms.length;
        const arm = arms[i];
        const started = Date.now();
        const reply = await provider.generateReply(arm.character, userText, history, arm.options);
        summary.arms[i].replies.push({ sample: sample + 1, reply, ms: Date.now() - started });
        checkpoint();
        console.log(`${arm.key} sample ${sample + 1} saved`);
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 9000 - (Date.now() - started))));
      }
    }
    for (let sample = 0; sample < 3; sample++) {
      for (let i = 0; i < controlCases.length; i++) {
        const control = controlCases[i];
        const started = Date.now();
        const reply = await provider.generateReply(character, control.userText, control.history, control.options);
        summary.controls[i].replies.push({ sample: sample + 1, reply, ms: Date.now() - started });
        checkpoint();
        console.log(`${control.key} sample ${sample + 1} saved`);
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 9000 - (Date.now() - started))));
      }
    }
  }
  summary.status = live ? 'completed' : 'offline-prompts-captured';
  summary.sourcesUnchanged = sourceFiles.every(file => createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex') === summary.sourceHashes[file]);
  checkpoint();
  writeFileSync(path.join(out, 'transcript.md'), '# Kana controlled diagnostic\n\n' + summary.scope + '\n\n' + [...summary.arms, ...summary.controls].map(arm => '## ' + arm.key + '\n\n' + arm.replies.map(r => `### Sample ${r.sample}\n\n${r.reply}`).join('\n\n')).join('\n\n') + '\n');
  console.log(out);
} catch (error) {
  summary.status = 'failed'; summary.error = error.message; checkpoint();
  throw error;
} finally {
  database?.close();
  if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('cai-kana-probe-')) throw new Error('Unsafe cleanup path');
  rmSync(directory, { recursive: true, force: true });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs, createEvalEnvironment, summarizeRun } from '../scripts/eval/run-eval.mjs';
import { parseTranscript } from '../scripts/eval/rescore.mjs';
import { aggregate, replyMetrics, subjectOpenerRate } from '../scripts/eval/metrics.mjs';

test('evaluation selectors reject typos, missing values and unsafe output labels', () => {
  const selected = parseArgs(['sample', '--only', 'mara,gojo', '--scenario', 'everyday']);
  assert.equal(selected.characters.length, 2);
  assert.equal(selected.scenarios.length, 1);
  assert.equal(parseArgs([]).characters.length, 3);
  for (const args of [['../escape'], ['--only'], ['--only', 'typo'], ['--unknown'], ['--scenario', 'everyday', '--scenario', 'everyday']]) {
    assert.throws(() => parseArgs(args));
  }
});

test('evaluation opts into Gemini while keeping database, mail and identity credentials isolated', () => {
  const directory = path.resolve('eval-test-fixture');
  const env = createEvalEnvironment(directory, {
    GEMINI_API_KEY: 'explicit-eval-key', TURSO_DATABASE_URL: 'libsql://production',
    TURSO_AUTH_TOKEN: 'cloud-token', SMTP_PASS: 'mail-secret', ADMIN_USERNAMES: 'owner',
    GEMINI_MODEL: 'explicit-model', DOTENV_CONFIG_PATH: 'production.env'
  }, { GEMINI_API_KEY: 'dotenv-key', GEMINI_MODEL: 'dotenv-model', TURSO_AUTH_TOKEN: 'another-cloud-token' });
  assert.equal(env.GEMINI_API_KEY, 'explicit-eval-key');
  assert.equal(env.GEMINI_MODEL, 'explicit-model');
  assert.equal(env.SQLITE_PATH, path.join(directory, 'universe.sqlite'));
  assert.equal(env.DOTENV_CONFIG_PATH, path.join(directory, 'unused.env'));
  assert.equal(env.NODE_ENV, 'test');
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SMTP_PASS', 'ADMIN_USERNAMES']) assert.equal(env[key], '');
  assert.equal(createEvalEnvironment(directory, {}, { GEMINI_API_KEY: 'dotenv-key' }).GEMINI_API_KEY, 'dotenv-key');
  assert.throws(() => createEvalEnvironment(directory, {}, {}), /GEMINI_API_KEY/);
});

test('partial run statistics retain failures and count per-turn appraisal availability', () => {
  const run = summarizeRun({ character: 'Mara Voss', turns: [
    { reply: 'Mara Voss: "Fine."', ms: 100, error: null, rel: { affinity: 0 }, appraisalStatus: 'verified' },
    { reply: 'Mara Voss: "Okay."', ms: 300, error: null, rel: { affinity: 0 }, appraisalStatus: 'unavailable' },
    { reply: '', ms: 90000, error: 'timeout', rel: {} }
  ] });
  assert.equal(run.errors, 1);
  assert.equal(run.metrics.turns, 2);
  assert.equal(run.meanLatencyMs, 200);
  assert.equal(run.verifiedAppraisalCount, 1);
  assert.deepEqual(run.affinityPath, [0, 0, null]);
  assert.equal(run.turns.length, 3);
  assert.equal(aggregate([]).turns, 0);
});

test('speaker labels do not count as repetitive subject-action openings', () => {
  assert.equal(subjectOpenerRate(['Mara Voss: "Fine."', '*Mara shuts the ledger.*', '*She sets down the pen.*'], 'Mara Voss'), 2 / 3);
  assert.equal(replyMetrics('Mara Voss: "Do you feel tired?"').controlsUser, false);
  assert.equal(replyMetrics('*Mara watches you stand up from the bench.*').controlsUser, true);
});

test('saved transcripts rescore across CRLF and unknown failed-turn relationship values', () => {
  const text = '# Eval sample\n\n## Mara Voss - everyday\n\n**User:** Thanks.\n\nMara Voss: "Fine."\n\n' +
    '<sub>125 ms | affinity 0 | stage Stranger / Neutral | mood Calm</sub>\n\n**User:** ok\n\n> ERROR timeout\n\n' +
    '<sub>90000 ms | affinity ? | stage ? | mood ?</sub>\n';
  const [run] = parseTranscript(text.replace(/\n/g, '\r\n'));
  assert.equal(run.character, 'Mara Voss');
  assert.equal(run.scenario, 'everyday');
  assert.equal(run.turns[0].reply, 'Mara Voss: "Fine."');
  assert.equal(run.turns[0].ms, 125);
  assert.equal(run.turns[0].affinity, 0);
  assert.equal(run.turns[0].stage, 'Stranger / Neutral');
  assert.equal(run.turns[1].affinity, null);
  assert.equal(run.turns[1].error, true);
});

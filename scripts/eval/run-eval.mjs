// Live evaluation through the real HTTP/appraisal/chat pipeline in a disposable database.
// Usage: node scripts/eval/run-eval.mjs <label> [--only kana,gojo] [--scenario everyday]
// Uses real Gemini quota (normally two calls per turn). Never connects to Turso.
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { parse } from 'dotenv';
import { createTestEnvironment } from '../run-tests.js';
import { CHARACTERS, SCENARIOS } from './scenarios.mjs';
import { aggregate } from './metrics.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function parseArgs(args) {
  const remaining = [...args];
  const label = remaining[0] && !remaining[0].startsWith('--') ? remaining.shift() : 'run';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(label)) throw new Error('Label must use letters, digits, hyphens or underscores (max 64).');
  const selections = {};
  while (remaining.length) {
    const flag = remaining.shift();
    if (!['--only', '--scenario'].includes(flag) || selections[flag]) throw new Error('Unknown or duplicate option: ' + flag);
    const value = remaining.shift();
    const allowed = (flag === '--only' ? CHARACTERS : SCENARIOS).map(x => x.key);
    if (!value || value.split(',').some(key => !allowed.includes(key))) throw new Error(flag + ' requires keys from: ' + allowed.join(', '));
    selections[flag] = value.split(',');
  }
  return {
    label,
    characters: CHARACTERS.filter(x => !selections['--only'] || selections['--only'].includes(x.key)),
    scenarios: SCENARIOS.filter(x => !selections['--scenario'] || selections['--scenario'].includes(x.key))
  };
}

export function createEvalEnvironment(directory, inherited, dotenv = {}) {
  const key = inherited.GEMINI_API_KEY || dotenv.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing from environment and .env');
  return {
    ...createTestEnvironment(directory, inherited),
    GEMINI_API_KEY: key,
    GEMINI_MODEL: inherited.GEMINI_MODEL || dotenv.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    GEMINI_FALLBACK_MODEL: inherited.GEMINI_FALLBACK_MODEL || dotenv.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite'
  };
}

export function summarizeRun(run) {
  const ok = run.turns.filter(t => !t.error);
  return {
    ...run,
    errors: run.turns.length - ok.length,
    meanLatencyMs: Math.round(ok.reduce((sum, t) => sum + t.ms, 0) / (ok.length || 1)),
    maxLatencyMs: Math.max(0, ...ok.map(t => t.ms)),
    affinityPath: run.turns.map(t => t.rel.affinity ?? null),
    finalStage: run.turns.at(-1)?.rel.relationshipStage ?? null,
    appraisalStatus: run.turns.at(-1)?.appraisalStatus ?? null,
    verifiedAppraisalCount: ok.filter(t => t.appraisalStatus === 'verified').length,
    metrics: aggregate(ok, run.character)
  };
}

async function main() {
  const { label, characters, scenarios } = parseArgs(process.argv.slice(2));
  const spacing = Number(process.env.EVAL_TURN_SPACING_MS ?? 9000);
  if (!Number.isFinite(spacing) || spacing < 0) throw new Error('EVAL_TURN_SPACING_MS must be a nonnegative number.');
  const dotenvPath = path.join(root, '.env');
  const dotenv = existsSync(dotenvPath) ? parse(readFileSync(dotenvPath)) : {};
  const dataDir = mkdtempSync(path.join(tmpdir(), 'cai-eval-'));
  let serverInstance, outDir, summary, transcript;
  const checkpoint = () => {
    writeFileSync(path.join(outDir, 'transcript.md'), transcript);
    writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  };
  try {
    Object.assign(process.env, createEvalEnvironment(dataDir, process.env, dotenv));
    outDir = path.join(root, 'scripts/eval/results', label + '-' + new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(outDir, { recursive: true });
    summary = { label, model: process.env.GEMINI_MODEL, fallbackModel: process.env.GEMINI_FALLBACK_MODEL,
      status: 'running', plannedSessions: characters.length * scenarios.length, runs: [] };
    transcript = '# Eval ' + label + '\n\nConfigured model: ' + summary.model + ' (fallback: ' + summary.fallbackModel + ')\n';
    checkpoint();
    console.log('Results (saved after every turn): ' + outDir);

    ({ serverInstance } = await import('../../server.js'));
    const httpServer = serverInstance.httpServer;
    if (!httpServer.listening) await once(httpServer, 'listening');
    await serverInstance.dbConnection.ensureReady();
    const base = 'http://127.0.0.1:' + httpServer.address().port;
    let token;
    async function api(method, url, body) {
      const response = await fetch(base + url, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(90000)
      }).catch(error => { throw new Error(method + ' ' + url + ': ' + (error.cause?.code || error.message)); });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(method + ' ' + url + ' -> ' + response.status + ' ' + JSON.stringify(data).slice(0, 300));
      return data;
    }
    token = (await api('POST', '/api/auth/register', { username: 'eval_' + Date.now(), password: 'evalPassword123', displayName: 'Linh' })).token;
    for (const spec of characters) {
      const character = spec.create
        ? await api('POST', '/api/character', spec.create).then(r => r.character || r)
        : await api('GET', '/api/character/' + spec.id).then(r => r.character || r);
      for (const scenario of scenarios) {
        const session = await api('POST', '/api/chats', { characterId: character.id }).then(r => r.session || r);
        if (scenario.relationship) await api('PUT', '/api/chats/' + session.id + '/relationship', scenario.relationship);
        transcript += '\n## ' + character.name + ' - ' + scenario.key + '\n';
        let run = { character: character.name, scenario: scenario.key, plannedTurns: scenario.turns.length, turns: [] };
        const index = summary.runs.push(run) - 1;
        for (const message of scenario.turns) {
          const started = Date.now();
          let data, error = null;
          try {
            data = await api('POST', '/api/chat', { charId: character.id, sessionId: session.id, message });
            if (!data.response?.trim()) throw new Error('Empty character reply');
          } catch (e) { error = e.message; }
          const ms = Date.now() - started;
          const final = await api('GET', '/api/chats/' + session.id).then(r => r.session || r).catch(() => ({}));
          const reply = data?.response || '';
          const rel = data?.relationship || {};
          run.turns.push({ message, reply, ms, error, rel, appraisalStatus: final.narrativeState?.appraisalStatus ?? null });
          run.narrativeState = final.narrativeState ?? null;
          transcript += '\n**User:** ' + message + '\n\n' + (error ? '> ERROR ' + error : reply) + '\n\n' +
            '<sub>' + ms + ' ms | affinity ' + (rel.affinity ?? '?') + ' | stage ' + (rel.relationshipStage ?? '?') + ' | mood ' + (rel.relationshipMood ?? '?') + '</sub>\n';
          run = summary.runs[index] = summarizeRun(run);
          checkpoint();
          console.log('[' + character.name + '/' + scenario.key + '] ' + run.turns.length + '/' + run.plannedTurns +
            ' ' + ms + 'ms aff=' + (rel.affinity ?? '?') + ' appraisal=' + (run.appraisalStatus ?? '?'));
          // Stop on a failed turn: subsequent replies would no longer have comparable history.
          if (error) throw new Error(error);
          await sleep(Math.max(0, spacing - (Date.now() - started)));
        }
      }
    }
    summary.status = 'completed';
    checkpoint();
    console.table(summary.runs.map(r => ({ who: r.character, scenario: r.scenario, errors: r.errors,
      ms: r.meanLatencyMs, affinity: r.affinityPath.at(-1), actionFirst: r.metrics.startsWithActionRate,
      shapes: r.metrics.distinctShapeRate, words: r.metrics.meanWords, appraisals: r.verifiedAppraisalCount })));
  } catch (error) {
    if (summary) { summary.status = 'failed'; summary.error = error.message; checkpoint(); }
    throw error;
  } finally {
    if (serverInstance) {
      serverInstance.httpServer?.closeAllConnections();
      await serverInstance.stop();
    }
    if (path.dirname(path.resolve(dataDir)) !== path.resolve(tmpdir()) || !path.basename(dataDir).startsWith('cai-eval-')) {
      throw new Error('Refusing cleanup outside evaluation temporary directory');
    }
    try { rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 }); }
    catch (error) {
      // A locked SQLite file must not hide the original API/evaluation failure.
      console.error('Could not clean evaluation temporary files: ' + error.message);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}


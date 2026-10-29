// Recompute metrics from a saved transcript.md (no API calls).
// Usage: node scripts/eval/rescore.mjs <resultsDir> [<resultsDir> ...]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate } from './metrics.mjs';

export function parseTranscript(md) {
  const sections = md.replace(/\r\n/g, '\n').split(/\n## /).slice(1);
  return sections.map(sec => {
    const [header, ...rest] = sec.split('\n');
    const [character, scenario] = header.split(/ [\u2014-] /);
    const body = rest.join('\n');
    const turns = body.split(/\n\*\*User:\*\* /).slice(1).map(chunk => {
      const [message, ...replyLines] = chunk.split('\n');
      const raw = replyLines.join('\n');
      const meta = raw.match(/<sub>(\d+) ms .*?affinity (\S+) .*?stage (.+?) \S mood (.+?)<\/sub>/);
      const reply = raw.replace(/<sub>[\s\S]*?<\/sub>/, '').trim();
      const affinity = meta && meta[2] !== '?' ? Number(meta[2]) : null;
      return { message, reply, ms: meta ? Number(meta[1]) : null, affinity: Number.isFinite(affinity) ? affinity : null, stage: meta?.[3] ?? null, error: reply.startsWith('> ERROR') };
    });
    return { character: character.trim(), scenario: scenario?.trim(), turns };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = [];
  for (const dir of process.argv.slice(2)) {
    for (const run of parseTranscript(readFileSync(path.join(dir, 'transcript.md'), 'utf8'))) {
      const ok = run.turns.filter(t => !t.error);
      const m = aggregate(ok, run.character);
      rows.push({ run: path.basename(dir).split('-20')[0], who: run.character.split(' ')[0], scen: run.scenario,
        aff: ok.at(-1)?.affinity, stage: ok.at(-1)?.stage, ms: Math.round(ok.reduce((a, t) => a + t.ms, 0) / (ok.length || 1)),
        act1st: m.startsWithActionRate, subj1st: m.subjectOpenerRate, shapes: m.distinctShapeRate,
        romance: m.romanceHitsPerReply, words: m.meanWords, q: m.endsWithQuestionRate, recurring: m.recurringTerms.slice(0, 4).join(' ') });
    }
  }
  console.table(rows);
}

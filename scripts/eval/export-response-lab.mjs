import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewedCandidates } from '../../backend/services/response-tournament.js';

const fingerprint = value => createHash('sha256').update(value).digest('hex');
const normalize = text => text.trim().toLowerCase().replace(/\s+/g, ' ');
const later = (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt) ||
  Date.parse(b.trialCreatedAt) - Date.parse(a.trialCreatedAt) || b.batchIndex - a.batchIndex;

// Offline extraction only: no database writes, generation calls or inferred votes.
export function extractEvaluations(raw) {
  if (!Array.isArray(raw?.trials) || !Array.isArray(raw?.labs)) throw new Error('Expected a Response Lab snapshot with labs and trials');
  const records = new Map(), candidateKeys = new Map(), rounds = [], invalidReviews = [], operational = [];
  let acceptedVotes = 0, rejectedVotes = 0;
  for (const trial of raw.trials) {
    if (!trial.id || !trial.contextHash || !Array.isArray(trial.batches)) throw new Error('Invalid trial');
    for (const [batchIndex, batch] of trial.batches.entries()) {
      const complete = batch.candidates.filter(c => c.status === 'complete');
      const valid = reviewedCandidates(batch);
      if (batch.feedback && !valid) invalidReviews.push({ trialId: trial.id, batchId: batch.id });
      const feedback = valid ? batch.feedback : null;
      const round = { trialId: trial.id, batchId: batch.id, round: batch.roundNumber || null, batchIndex,
        contextHash: trial.contextHash, message: trial.message, tournament: !!batch.tournament,
        reviewed: !!feedback, reviewedAt: feedback?.reviewedAt || null,
        complete: complete.length, carried: complete.filter(c => c.carriedFromBatchId).length,
        newReplies: complete.filter(c => !c.carriedFromBatchId).length,
        accepted: feedback?.accepted.length || 0, rejected: feedback?.rejected.length || 0,
        trialStatus: trial.status, screening: batch.screening || null };
      rounds.push(round);
      for (const candidate of complete) {
        const responseId = fingerprint(`${trial.contextHash}\0${normalize(candidate.text)}`);
        const identity = `${trial.contextHash}\0${candidate.id}`;
        if (candidateKeys.has(identity) && candidateKeys.get(identity) !== responseId) throw new Error('A carried candidate changed text');
        candidateKeys.set(identity, responseId);
        let record = records.get(responseId);
        if (!record) {
          record = { responseId, contextHash: trial.contextHash, prompt: trial.message,
            setup: trial.context?.setup || '', character: trial.context?.character?.name || '',
            stage: trial.prepared?.evaluatedState?.relationshipStage || trial.context?.state?.relationshipStage || '',
            text: candidate.text, candidateIds: [], presentations: [], judgments: [] };
          records.set(responseId, record);
        }
        if (!record.candidateIds.includes(candidate.id)) record.candidateIds.push(candidate.id);
        const origin = { trialId: trial.id, batchId: batch.id, candidateId: candidate.id, round: batch.roundNumber || null,
          batchIndex, trialCreatedAt: trial.createdAt, originBatchId: candidate.originBatchId || batch.id,
          carriedFromBatchId: candidate.carriedFromBatchId || null };
        record.presentations.push(origin);
        if (feedback) {
          const label = feedback.accepted.includes(candidate.id) ? 'accepted' : 'rejected';
          record.judgments.push({ ...origin, label, favorite: feedback.favorite === candidate.id, reviewedAt: feedback.reviewedAt });
          if (label === 'accepted') acceptedVotes++; else rejectedVotes++;
        }
      }
      // Machine filtering and failed checks are audit data, never human labels.
      for (const attempt of batch.screeningAttempts || []) {
        operational.push({ trialId: trial.id, batchId: batch.id, round: batch.roundNumber || null,
          attempt: attempt.attempt, status: attempt.status, blocked: attempt.blocked || [],
          allowedIds: attempt.allowedIds || [], candidateIds: (attempt.candidates || []).map(c => c.id) });
      }
    }
  }
  const responses = [...records.values()].map(record => {
    record.judgments.sort(later);
    const latest = record.judgments[0] || null;
    return { ...record, label: latest?.label || 'unreviewed', latestJudgment: latest,
      conflictingLabels: new Set(record.judgments.map(j => j.label)).size > 1 };
  });
  const contexts = [...new Set(responses.map(r => r.contextHash))].map(contextHash => ({
    contextHash, accepted: responses.filter(r => r.contextHash === contextHash && r.label === 'accepted').map(r => r.responseId),
    rejected: responses.filter(r => r.contextHash === contextHash && r.label === 'rejected').map(r => r.responseId),
    unreviewed: responses.filter(r => r.contextHash === contextHash && r.label === 'unreviewed').map(r => r.responseId)
  }));
  return { format: 'response-lab-reviewed-results-v1', sourceExportedAt: raw.exportedAt, extractedAt: new Date().toISOString(),
    rules: ['Explicit saved feedback only. Unreviewed rounds, drafts and machine filtering are not votes.',
      'Deduplicate carried IDs and normalized full-text repeats within the same contextHash; newest explicit judgment wins.',
      'Keep contextHash groups together for training/evaluation splits. Binary labels do not explain preference reasons.',
      'This is a review dataset, not an automatically validated or provider-ready fine-tuning dataset.'],
    summary: { labs: raw.labs.length, trials: raw.trials.length, batches: rounds.length,
      generatingTrials: raw.trials.filter(t => t.status === 'generating').length,
      reviewedBatches: rounds.filter(r => r.reviewed).length, unreviewedBatches: rounds.filter(r => !r.reviewed).length,
      acceptedVotes, rejectedVotes, uniqueAccepted: responses.filter(r => r.label === 'accepted').length,
      uniqueRejected: responses.filter(r => r.label === 'rejected').length,
      uniqueUnreviewed: responses.filter(r => r.label === 'unreviewed').length,
      conflictingResponses: responses.filter(r => r.conflictingLabels).length,
      invalidReviews: invalidReviews.length, automaticBlocked: operational.reduce((sum, a) => sum + a.blocked.length, 0),
      failedScreeningAttempts: operational.filter(a => a.status === 'screening-unavailable').length },
    responses, contexts, rounds, operational, invalidReviews };
}

export function writeExtraction(raw, directory) {
  const result = extractEvaluations(raw), out = path.resolve(directory);
  mkdirSync(out, { recursive: true });
  const jsonl = rows => rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  for (const label of ['accepted', 'rejected', 'unreviewed']) {
    writeFileSync(path.join(out, `${label}.jsonl`), jsonl(result.responses.filter(r => r.label === label)));
  }
  const tournamentIds = new Set(raw.trials.filter(t => t.batches.some(b => b.tournament)).map(t => t.id));
  for (const label of ['accepted', 'rejected']) {
    writeFileSync(path.join(out, `tournament-${label}.jsonl`), jsonl(result.responses.filter(r => r.label === label &&
      r.presentations.some(p => tournamentIds.has(p.trialId)))));
  }
  writeFileSync(path.join(out, 'preference-groups.jsonl'), jsonl(result.contexts));
  writeFileSync(path.join(out, 'contexts.jsonl'), jsonl(raw.trials.map(t => ({ trialId: t.id, contextHash: t.contextHash,
    message: t.message, context: t.context, prepared: t.prepared }))));
  const csv = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const columns = ['contextHash', 'trialId', 'batchId', 'round', 'candidateId', 'carriedFromBatchId', 'label', 'favorite', 'reviewedAt'];
  writeFileSync(path.join(out, 'review-history.csv'), '\ufeff' + [columns.join(','),
    ...result.responses.flatMap(r => r.judgments.map(j => columns.map(k => csv(k === 'contextHash' ? r.contextHash : j[k])).join(',')))].join('\r\n'));
  const s = result.summary;
  const text = ['# Extracted Response Lab results', '', `Snapshot: ${raw.exportedAt}.`, '',
    `Saved review observations: **${s.acceptedVotes} accepted / ${s.rejectedVotes} rejected** across ${s.reviewedBatches} reviewed batches.`,
    `After carried-answer and full-text deduplication, using latest labels: **${s.uniqueAccepted} accepted / ${s.uniqueRejected} rejected**.`,
    `${s.unreviewedBatches} batches remain unreviewed; ${s.uniqueUnreviewed} unique replies have no saved judgment.`, '',
    ...(s.generatingTrials ? [`${s.generatingTrials} trial(s) had a generating status at the snapshot. Partial/unreviewed rounds contribute no new preference labels.`, ''] : []),
    ...result.rules.map(rule => `- ${rule}`), '',
    'The JSONL files preserve the full reply text, original context reference, all presentations and explicit review history. Contexts contain private persona/story data. Raw feedback retains complete generation and screening provenance.', '',
    '## Latest reviewed tournament selections', ''];
  for (const trial of raw.trials.filter(t => t.batches.some(b => b.tournament))) {
    const reviewed = trial.batches.filter(b => b.tournament && reviewedCandidates(b));
    const last = reviewed.at(-1);
    text.push(`### Prompt: ${trial.message}`, '', `Trial: ${trial.id}.`, '');
    if (!last) { text.push('No saved tournament judgment.', ''); continue; }
    text.push(`Latest saved selection: Round ${last.roundNumber}, ${last.feedback.accepted.length} accepted, ${last.feedback.rejected.length} rejected.`, '',
      '| Round | Carried | New shown | Accepted | Rejected | Reviewed |', '| --- | ---: | ---: | ---: | ---: | --- |');
    for (const r of result.rounds.filter(r => r.trialId === trial.id)) text.push(`| ${r.round || r.batchIndex + 1} | ${r.carried} | ${r.newReplies} | ${r.accepted} | ${r.rejected} | ${r.reviewed ? 'Yes' : 'No'} |`);
    text.push('');
    for (const c of last.candidates.filter(c => last.feedback.accepted.includes(c.id))) {
      text.push(`#### Kept answer ${c.id}`, '', c.text, '');
    }
    const rejected = result.responses.filter(r => r.label === 'rejected' && r.presentations.some(p => p.trialId === trial.id));
    text.push(`### Rejected alternatives in this tournament (${rejected.length} unique)`, '');
    for (const r of rejected) text.push(`#### Rejected answer ${r.candidateIds[0]}`, '', r.text, '');
  }
  writeFileSync(path.join(out, 'summary.md'), text.join('\n'));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, directory] = process.argv.slice(2);
  if (!input || !directory) throw new Error('Usage: node scripts/eval/export-response-lab.mjs INPUT_JSON OUTPUT_DIRECTORY');
  const result = writeExtraction(JSON.parse(readFileSync(input, 'utf8')), directory);
  console.log(JSON.stringify(result.summary, null, 2));
}

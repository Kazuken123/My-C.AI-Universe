import { ConflictError, ValidationError } from '../ai/errors.js';

export const TOURNAMENT_CHALLENGERS = 5;
export const TOURNAMENT_ATTEMPTS = 3;
export const TOURNAMENT_MAX_CANDIDATES = 100;
const key = text => text.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

// A round is a snapshot of the user's last submitted selection, not another vote.
export function createTournamentRound(trial, sourceBatchId) {
  const source = trial.batches.at(-1);
  if (source ? source.id !== sourceBatchId : sourceBatchId != null) {
    throw new ConflictError('Advance from the latest round. Reload before trying again.');
  }
  const complete = source?.candidates.filter(c => c.status === 'complete') || [];
  if (complete.length && !reviewedCandidates(source)) throw new ConflictError('Save your choices before advancing this round.');
  const selected = new Set(source?.feedback?.accepted || []);
  const candidates = complete.filter(c => selected.has(c.id)).map(c => ({
    id: c.id, text: c.text, status: 'complete', move: c.move, model: c.model, provider: c.provider,
    originBatchId: c.originBatchId || source.id, carriedFromBatchId: source.id
  }));
  if (candidates.length + TOURNAMENT_CHALLENGERS > TOURNAMENT_MAX_CANDIDATES) {
    throw new ValidationError('Keep at most 95 answers before adding five more.');
  }
  return { tournament: true, comparison: false, roundNumber: (source?.roundNumber || 0) + 1,
    sourceBatchId: source?.id || null, carriedCount: candidates.length, challengerCount: TOURNAMENT_CHALLENGERS,
    diversityVersion: 'tournament-v1', candidates, feedback: null };
}

export function reviewedCandidates(batch) {
  const feedback = batch.feedback;
  const complete = batch.candidates?.filter(c => !c.status || c.status === 'complete') || [];
  if (!feedback || !Number.isFinite(Date.parse(feedback.reviewedAt)) || !complete.length ||
      !Array.isArray(feedback.accepted) || !Array.isArray(feedback.rejected)) return null;
  const ids = new Set(complete.map(c => c.id)), labels = [...feedback.accepted, ...feedback.rejected];
  if (ids.size !== complete.length || labels.length !== ids.size || new Set(labels).size !== ids.size ||
      labels.some(id => !ids.has(id)) || complete.some(c => typeof c.text !== 'string' || !c.text.trim()) ||
      (feedback.noneFit === true ? feedback.accepted.length !== 0 : feedback.accepted.length === 0) ||
      (feedback.favorite && !feedback.accepted.includes(feedback.favorite))) return null;
  return complete;
}

// Only explicit reviews from this exact frozen scene are vetoes. Newest labels
// override older ones for carried IDs and identical replies; no topic-wide bans.
export function collectTournamentMemory(trial, otherReviews = []) {
  const local = trial.batches.map(b => ({ ...b, trialId: trial.id })).reverse();
  const reviews = [...local, ...otherReviews.filter(b => b.trialId !== trial.id)]
    .filter(b => reviewedCandidates(b))
    .sort((a, b) => Date.parse(b.feedback.reviewedAt) - Date.parse(a.feedback.reviewedAt));
  const ids = new Set(), texts = new Set(), rejected = [], accepted = [];
  for (const batch of reviews) {
    for (const c of reviewedCandidates(batch)) {
      const normalized = key(c.text);
      if (ids.has(c.id) || texts.has(normalized)) continue;
      ids.add(c.id); texts.add(normalized);
      const example = { id: c.id, text: c.text, move: c.move || '', trialId: batch.trialId,
        batchId: batch.id, reviewedAt: batch.feedback.reviewedAt };
      (batch.feedback.accepted.includes(c.id) ? accepted : rejected).push(example);
    }
  }
  return { accepted, rejected };
}

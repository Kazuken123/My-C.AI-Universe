import { createHash } from 'node:crypto';
import { responseLabRepository } from '../repositories/ResponseLabRepository.js';
import { normalizeRelationshipStage } from '../../frontend/js/relationship-contract.js';

const CONFLICT_MOODS = new Set(['Quarreling / Heated', 'Hurt / Heartbroken', 'Softening / Reconciling',
  'Guarded', 'Afraid', 'Hostile', 'Disappointed', 'Stern']);
const STOPWORDS = new Set('the and that this with from your you our are was have has what how can could would about just into for but not'.split(' '));
const tokens = value => new Set((String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
  .filter(word => word.length > 2 && !STOPWORDS.has(word)));
const overlap = (left, right) => [...left].reduce((sum, word) => sum + Number(right.has(word)), 0);
const clip = (value, max) => String(value || '').slice(0, max);

function validatedReview(row) {
  const { feedback, candidates } = row;
  if (!row.trialId || !row.batchId || !row.contextHash || !feedback || !Number.isFinite(Date.parse(feedback.reviewedAt)) ||
      !Array.isArray(candidates) || !candidates.length || candidates.length > 100 ||
      !Array.isArray(feedback.accepted) || !Array.isArray(feedback.rejected)) return null;
  const complete = new Map();
  for (const candidate of candidates) {
    if (typeof candidate?.id !== 'string' || !candidate.id || typeof candidate.text !== 'string' || !candidate.text.trim() || complete.has(candidate.id)) return null;
    complete.set(candidate.id, candidate);
  }
  const labels = [...feedback.accepted, ...feedback.rejected];
  if (labels.length !== complete.size || new Set(labels).size !== complete.size || labels.some(id => !complete.has(id)) ||
      (feedback.noneFit === true ? feedback.accepted.length !== 0 : feedback.accepted.length === 0) ||
      (feedback.favorite && !feedback.accepted.includes(feedback.favorite))) return null;
  return { row, complete, feedback };
}

function combineReviews(reviews) {
  const latest = reviews[0].row;
  const seen = new Set(), accepted = [], rejected = [];
  for (const { row, complete, feedback } of reviews) {
    for (const [id, candidate] of complete) {
      const originalLength = candidate.originalLength || candidate.text.length;
      // Only compare exact texts when SQL returned the complete response. Shared
      // prefixes of longer answers do not prove that they are the same answer.
      const key = originalLength <= candidate.text.length ? `text:${candidate.text}` : `id:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const positive = feedback.accepted.includes(id), max = positive ? 1200 : 800;
      const example = { id, text: clip(candidate.text, max), truncated: originalLength > max,
        trialId: row.trialId, batchId: row.batchId, reviewedAt: feedback.reviewedAt,
        ...(positive ? { favorite: id === feedback.favorite } : {}) };
      (positive ? accepted : rejected).push(example);
    }
  }
  accepted.sort((a, b) => Number(b.favorite) - Number(a.favorite) || Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));
  return {
    trialId: latest.trialId, batchId: latest.batchId, contextHash: latest.contextHash, reviewedAt: latest.feedback.reviewedAt,
    prompt: clip(latest.prompt, 600), setup: clip(latest.setup, 700), stage: normalizeRelationshipStage(latest.stage), mood: latest.mood || 'Calm',
    accepted: accepted.slice(0, 2), rejected: rejected.slice(0, 1), noneFit: accepted.length === 0,
    acceptedIds: accepted.map(c => c.id), rejectedIds: rejected.map(c => c.id), favoriteId: accepted.find(c => c.favorite)?.id || null,
    reviewedBatchCount: reviews.length
  };
}

export class ResponsePreferencesService {
  constructor(repo = responseLabRepository) { this.repo = repo; }

  async forContext({ userId, characterId, personaId, stage, mood, message, setup } = {}) {
    if (!userId || !characterId || !stage) return null;
    const rows = await this.repo.reviewedForPreferences({ userId, characterId, personaId });
    const query = tokens(message), scene = tokens(setup);
    const contexts = new Map();
    const groups = [];
    const matches = rows.filter(row => normalizeRelationshipStage(row.stage) === normalizeRelationshipStage(stage) &&
      CONFLICT_MOODS.has(row.mood) === CONFLICT_MOODS.has(mood))
      .sort((a, b) => Date.parse(b.feedback?.reviewedAt || '') - Date.parse(a.feedback?.reviewedAt || ''));
    for (const row of matches) {
      const review = validatedReview(row);
      if (!review) continue;
      const recent = contexts.get(row.contextHash) || [];
      if (recent.length < 6) recent.push(review);
      contexts.set(row.contextHash, recent);
    }
    for (const reviews of contexts.values()) {
      const group = combineReviews(reviews);
      const score = 2 * overlap(query, tokens(group.prompt)) + overlap(scene, tokens(group.setup));
      groups.push({ group, score });
    }
    groups.sort((a, b) => b.score - a.score || Date.parse(b.group.reviewedAt) - Date.parse(a.group.reviewedAt));
    const selected = [];
    for (const { group } of groups) {
      if (JSON.stringify([...selected, group]).length > 9500) continue;
      selected.push(group);
      if (selected.length === 2) break;
    }
    if (!selected.length) return null;
    return { version: 'reviewed-examples-v1', fingerprint: createHash('sha256').update(JSON.stringify(selected)).digest('hex'), groups: selected };
  }
}

export const responsePreferencesService = new ResponsePreferencesService();

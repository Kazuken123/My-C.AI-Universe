import { randomUUID, createHash, randomInt } from 'node:crypto';
import { responseLabRepository } from '../repositories/ResponseLabRepository.js';
import { characterRepository, personaRepository, chatSessionRepository } from '../repositories/index.js';
import { memoryService } from './memory.service.js';
import { prepareResponseContext } from './response-context.js';
import { responsePreferencesService } from './response-preferences.service.js';
import { snapshot, prepareNarrativeState } from './turn-state.js';
import { ChatMessage } from '../models/ChatSession.js';
import { geminiProvider, ollamaProvider } from '../ai/providers/index.js';
import { parseLabCandidates } from './response-lab-candidates.js';
import { responseTournamentScreening, screenInitialCandidates } from './response-tournament-screening.js';
import { withRequestDeadline, labFailure } from '../ai/request-deadline.js';
import { createTournamentRound, collectTournamentMemory, TOURNAMENT_ATTEMPTS, TOURNAMENT_CHALLENGERS } from './response-tournament.js';
import { RESPONSE_LAB_APPROACHES } from '../ai/prompt/responseAlternatives.js';
import { config } from '../config/index.js';
import { normalizeProviderName } from '../ai/providerSelection.js';
import { RELATIONSHIP_PRESETS } from '../../frontend/js/relationship-contract.js';
import { ValidationError, NotFoundError, ConflictError } from '../ai/errors.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value, name, max, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ValidationError(`${name} must contain 1–${max} characters`, name);
  return value.trim();
}
function requireIdle(trial) { if (trial.status === 'generating') throw new ConflictError('Wait for this batch to finish.'); }

export class ResponseLabService {
  constructor({ repo = responseLabRepository, chars = characterRepository, personas = personaRepository,
    sessions = chatSessionRepository, memories = memoryService, prepare = prepareResponseContext,
    providers = { gemini: geminiProvider, ollama: ollamaProvider }, preferences = responsePreferencesService,
    screening = responseTournamentScreening, generationTimeoutMs = 45000 } = {}) {
    Object.assign(this, { repo, chars, personas, sessions, memories, prepare, providers, preferences, screening, generationTimeoutMs });
    this.jobs = new Map();
  }
  async create(userId, input) {
    let source = null;
    if (input.sourceSessionId) {
      source = await this.sessions.findById(text(input.sourceSessionId, 'Chat ID', 150), userId);
      if (!source) throw new NotFoundError('Source chat not found');
    }
    const character = await this.chars.findById(source?.characterId || text(input.characterId, 'Character', 150));
    if (!character) throw new NotFoundError('Character not found');
    const personaId = source?.personaId || input.personaId;
    const persona = personaId ? await this.personas.findById(personaId, userId) : await this.personas.findDefault(userId);
    if (input.personaId && !persona && !source) throw new NotFoundError('Persona not found');
    const setup = text(input.setup, 'Scene setup', 4000, true);
    const preset = input.stage ? RELATIONSHIP_PRESETS.find(p => p.stage === input.stage) : null;
    if (input.stage && !preset) throw new ValidationError('Choose a valid relationship stage');
    const state = source ? snapshot(source) : {
      affinity: preset?.affinity ?? character.initialAffinity ?? 0,
      trust: preset?.trust ?? character.initialAffinity ?? 0, strain: 0,
      relationshipStage: preset?.stage || character.initialRelationshipStage || 'Stranger / Neutral',
      relationshipMood: 'Calm', narrativeState: {}
    };
    const [memories, storySummary] = await Promise.all([
      this.memories.getMemories(character.id, source?.id || null),
      source ? this.memories.getSessionStorySummary(source.id) : Promise.resolve('')
    ]);
    const characterData = character.toJSON();
    delete characterData.avatar; // Image data is unrelated to response generation.
    const lab = { id: randomUUID(), title: text(input.title, 'Title', 100, true) || `${character.name} · Response Lab`, createdAt: new Date().toISOString(),
      snapshot: { character: characterData, persona: persona ? { id: persona.id, name: persona.name, description: persona.description } : null,
        provider: normalizeProviderName(source?.provider || input.provider || config.AI_PROVIDER),
        state, history: source ? source.messages.slice(-config.MAX_MEMORY_MESSAGES).map(m => ({ role: m.role, content: m.variants?.[m.selectedVariantIndex]?.text || m.content })) : [{ role: 'model', content: character.greeting }],
        pinnedMessages: [...(source ? source.getPinnedMessages().map(m => ({ role: m.role, content: m.content })) : []), ...(setup ? [{ role: 'user', content: setup }] : [])],
        memories: memories.slice(-100), storySummary, setup, sourceSessionId: source?.id || null }
    };
    return this.repo.create(lab, userId);
  }
  async newTrial(userId, labId, input) {
    const lab = await this.repo.get(labId, userId);
    const message = text(input.message, 'Message', config.MAX_MESSAGE_LENGTH);
    const id = text(input.requestId, 'Request ID', 100);
    try {
      const existing = await this.repo.trial(id, userId);
      if (existing.labId !== labId || existing.message !== message) throw new ConflictError('Request ID already used for another prompt');
      return existing;
    } catch (error) { if (!(error instanceof NotFoundError)) throw error; }
    if ((await this.repo.trials(labId, userId)).length >= 100) throw new ValidationError('This lab has 100 prompts. Create a new lab to continue.');
    return this.repo.createTrial({ id, labId, message, context: lab.snapshot, contextHash: hash({ snapshot: lab.snapshot, message }),
      createdAt: new Date().toISOString(), batches: [], prepared: null }, userId);
  }
  async start(userId, trialId, input) {
    await this.repo.expire(userId);
    let current = await this.repo.trial(trialId, userId);
    const requestId = text(input.requestId, 'Request ID', 100);
    if (input.mode && !['standard', 'comparison', 'tournament'].includes(input.mode)) throw new ValidationError('Choose a valid generation mode');
    if (current.batches.some(b => b.id === requestId)) return current; // replay, no extra provider calls
    const claimed = await this.repo.mutate(trialId, userId, input.revision, trial => {
      requireIdle(trial);
      if (trial.batches.length >= 20) throw new ValidationError('Twenty batches reached. Start another prompt.');
      if (trial.batches.at(-1)?.tournament && input.mode !== 'tournament') throw new ValidationError('Continue this tournament with another round.');
      const round = input.mode === 'tournament' ? createTournamentRound(trial, input.sourceBatchId) : null;
      trial.status = 'generating';
      trial.batches.push({ id: requestId, createdAt: new Date().toISOString(),
        comparison: input.mode === 'comparison', diversityVersion: input.mode === 'comparison' ? 'blind-character-v1' : 'joint-v4-narration', candidates: [], feedback: null,
        ...(round || {}) });
    });
    const job = this.generate(userId, claimed).catch(error => console.error('[RESPONSE LAB] Worker failed:', error.message));
    this.jobs.set(trialId, job);
    job.finally(() => this.jobs.delete(trialId));
    return claimed;
  }
  async generate(userId, trial) {
    try {
      const c = trial.context;
      if (!trial.prepared) {
        const query = trial.message.length < 30 ? `${c.history.at(-1)?.content?.slice(-200) || ''} ${trial.message}` : trial.message;
        const memories = [...c.memories].sort((a, b) => this.memories.computeSimilarity(query, b.content) - this.memories.computeSimilarity(query, a.content)).slice(0, 4);
        const prepared = await this.prepare({ character: c.character, session: { ...c.state, provider: c.provider },
          message: trial.message, query, history: c.history, persona: c.persona, pinnedMessages: c.pinnedMessages,
          memories, storySummary: c.storySummary, provider: c.provider });
        trial = await this.repo.mutate(trial.id, userId, trial.revision, t => { t.prepared = prepared; });
      }
      const provider = this.providers[c.provider];
      // Refresh on each batch, then freeze for both arms. Keep appraisal/story preparation unchanged.
      // Tournament selection supersedes older example retrieval. Feeding an old
      // positive back here can resurrect a style the latest round eliminated.
      const writingPreferences = trial.batches.at(-1).tournament ? null : await this.preferences.forContext({ userId, characterId: c.character.id,
        personaId: c.persona?.id || null, stage: trial.prepared.evaluatedState.relationshipStage,
        mood: trial.prepared.evaluatedState.relationshipMood, message: trial.message, setup: c.setup });
      trial = await this.repo.mutate(trial.id, userId, trial.revision, t => {
        Object.assign(t.batches.at(-1), { writingPreferences, preferenceFingerprint: writingPreferences?.fingerprint || null,
          preferenceReviewCount: writingPreferences?.groups.reduce((sum, group) => sum + (group.reviewedBatchCount || 1), 0) || 0 });
      });
      const model = c.provider === 'gemini' ? provider.modelName : config.OLLAMA_MODEL;
      if (trial.batches.at(-1).tournament) return await this.generateTournament(userId, trial, provider, model, writingPreferences);
      const comparison = trial.batches.at(-1).comparison === true;
      const arms = comparison ? ['current-v4', 'character-v1'] : ['current-v4'];
      if (comparison && randomInt(2)) arms.reverse();
      const allCandidates = [];
      for (const arm of arms) {
        const order = [...RESPONSE_LAB_APPROACHES]; // Fisher-Yates below, independent of feedback.
        for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
        const prior = comparison ? [] : trial.batches.flatMap(b => b.candidates).filter(x => x.status === 'complete');
        // Compare abstract moves, not earlier prose: negative examples were being copied.
        const options = { ...structuredClone(trial.prepared.aiOptions), writingPreferences: structuredClone(writingPreferences), requireComplete: true, timeout: 45000,
          modelOverride: model, isRegenerate: true, ...(arm === 'character-v1' ? { labPromptVersion: arm } : {}),
          labAlternatives: { approaches: order, previousMoves: prior.map(x => x.move).filter(Boolean).slice(-10) } };
        const started = Date.now();
        let candidates;
        try {
          const rawReply = await withRequestDeadline(signal => provider.generateReply(structuredClone(c.character), trial.message, structuredClone(c.history), { ...options, signal }), this.generationTimeoutMs);
          candidates = parseLabCandidates(rawReply, { character: c.character, provider: c.provider, model, options, arm, prior, comparison, started });
        } catch {
          candidates = [{ id: randomUUID(), status: 'failed', text: '',
            error: 'The batch failed or did not return five valid answers. This option cannot be rated.',
            model, provider: c.provider, ms: Date.now() - started }];
        }
        allCandidates.push(...candidates);
      }
      // Publish a comparison only when both arms completed; never compare a partial pair.
      let published = allCandidates;
      if (comparison) {
        if (published.length !== 10 || published.some(c => c.status !== 'complete') || new Set(published.map(c => c.text.trim().toLowerCase())).size !== 10) {
          published = [{ id: randomUUID(), status: 'failed', text: '', error: 'The comparison did not complete both sets. Request another comparison.', model, provider: c.provider }];
        } else {
          for (let i = published.length - 1; i > 0; i--) { const j = randomInt(i + 1); [published[i], published[j]] = [published[j], published[i]]; }
        }
      }
      // Validate the entire structured result before publishing any rateable answers.
      await this.repo.mutate(trial.id, userId, trial.revision, t => { t.batches.at(-1).candidates = published; t.status = 'ready'; });
    } catch {
      try { await this.repo.mutate(trial.id, userId, trial.revision, t => { t.status = 'interrupted'; }); } catch { /* lease recovery handles restarts/races */ }
    }
  }
  async generateTournament(userId, trial, provider, model, writingPreferences) {
    const c = trial.context, batch = trial.batches.at(-1);
    const otherReviews = this.repo.reviewsForTournament ? await this.repo.reviewsForTournament({ userId, contextHash: trial.contextHash }) : [];
    const memory = collectTournamentMemory(trial, otherReviews);
    const carried = structuredClone(batch.candidates), challengers = [], attempts = [], withheld = [];
    // A failed reviewer should not force the user to pay for the same first set
    // again. Reuse only this trial's unreviewed, already parsed initial replies.
    const cached = !memory.accepted.length && !memory.rejected.length && !carried.length
      ? trial.batches.slice(0, -1).reverse().flatMap(b => b.feedback ? [] :
        (b.screeningAttempts || []).filter(a => a.status === 'screening-unavailable' && a.candidates?.length === 5 &&
          a.candidates.every(c => ['complete', 'duplicate'].includes(c.status) && typeof c.text === 'string' && c.text.trim()))
          .map(a => ({ batchId: b.id, candidates: a.candidates }))).at(0) : null;
    const screening = { filteredCount: 0, similarityCount: 0, groundingCount: 0, attempts: 0, incomplete: false, unavailable: false, generationFailed: false };
    // A generated candidate is never a user rejection. Keep screening provenance
    // separately so exports cannot accidentally teach synthetic negatives.
    trial = await this.repo.mutate(trial.id, userId, trial.revision, t => {
      t.batches.at(-1).tournamentMemory = memory;
    });
    for (let attempt = 0; attempt < TOURNAMENT_ATTEMPTS && challengers.length < TOURNAMENT_CHALLENGERS; attempt++) {
      screening.attempts++;
      const order = [...RESPONSE_LAB_APPROACHES];
      for (let i = order.length - 1; i > 0; i--) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      const options = { ...structuredClone(trial.prepared.aiOptions), writingPreferences: structuredClone(writingPreferences),
        requireComplete: true, timeout: 45000, modelOverride: model, isRegenerate: true,
        labAlternatives: { approaches: order, previousMoves: [] },
        labTournament: {
          survivors: [...carried, ...challengers].map(x => x.move).filter(Boolean).slice(-50),
          rejected: memory.rejected.map(x => x.move).filter(Boolean).slice(0, 60),
          screenedOut: withheld.map(x => ({ move: x.move, reason: x.reason })).slice(-15)
        } };
      const started = Date.now();
      let generated;
      try {
        if (cached && attempt === 0) {
          generated = structuredClone(cached.candidates).map(c => ({ ...c, originBatchId: cached.batchId, recoveredFromBatchId: cached.batchId }));
          screening.reusedGeneratedSet = true;
        } else {
          const raw = await withRequestDeadline(signal => provider.generateReply(structuredClone(c.character), trial.message, structuredClone(c.history), { ...options, signal }), this.generationTimeoutMs);
          generated = parseLabCandidates(raw, { character: c.character, provider: c.provider, model, options, arm: 'current-v4', started });
        }
      } catch (error) {
        screening.generationFailed = true;
        screening.failure = labFailure(error, 'generation');
        attempts.push({ attempt: attempt + 1, status: 'generation-failed', failure: screening.failure });
        break;
      }
      // The evaluator receives the full text, including exact-duplicate candidates,
      // to partition every attempted answer before any is displayed.
      let result;
      try {
        const initialSet = !memory.rejected.length && !memory.accepted.length && !carried.length && !challengers.length;
        result = initialSet ? screenInitialCandidates(generated) : await this.screening.screen({ provider: c.provider, model,
          context: { setup: c.setup, message: trial.message, characterName: c.character.name,
            story: { history: c.history, persona: c.persona,
              profile: Object.fromEntries(['name', 'personality', 'background', 'speaking_style'].map(key => [key, c.character[key] || ''])),
              relationship: trial.prepared.aiOptions.relationship, narrative: trial.prepared.aiOptions.narrativeContext,
              pinnedMessages: c.pinnedMessages, memories: trial.prepared.aiOptions.memories, storySummary: c.storySummary } },
          candidates: generated, rejected: memory.rejected, existing: [...carried, ...challengers] });
        const ids = new Set(generated.map(x => x.id));
        const labels = [...result.allowedIds, ...result.blocked.map(x => x.id)];
        if (labels.length !== ids.size || new Set(labels).size !== ids.size || labels.some(id => !ids.has(id))) throw new Error('Invalid screening partition');
      } catch (error) {
        screening.unavailable = true;
        screening.failure = labFailure(error, 'screening');
        attempts.push({ attempt: attempt + 1, status: 'screening-unavailable', candidates: generated, failure: screening.failure });
        break;
      }
      screening.filteredCount += result.blocked.length;
      screening.method = result.method;
      screening.groundingCount += result.blocked.filter(x => x.reasonType === 'grounding').length;
      screening.similarityCount += result.blocked.filter(x => x.reasonType !== 'grounding').length;
      const allowed = new Set(result.allowedIds);
      for (const candidate of generated) {
        const blocked = result.blocked.find(x => x.id === candidate.id);
        if (blocked) withheld.push({ id: candidate.id, move: candidate.move, reason: blocked.reason });
        if (allowed.has(candidate.id) && challengers.length < TOURNAMENT_CHALLENGERS) {
          challengers.push({ ...candidate, status: 'complete', originBatchId: candidate.originBatchId || batch.id });
        }
      }
      attempts.push({ attempt: attempt + 1, status: 'screened', method: result.method, chunkCount: result.chunkCount, candidates: generated,
        allowedIds: result.allowedIds, blocked: result.blocked });
      // Persist successful screening incrementally. A restart keeps survivors and
      // already checked challengers; the lease recovery never invents feedback.
      trial = await this.repo.mutate(trial.id, userId, trial.revision, t => {
        Object.assign(t.batches.at(-1), { candidates: [...carried, ...challengers], screening: { ...screening }, screeningAttempts: attempts });
      });
    }
    screening.incomplete = challengers.length < TOURNAMENT_CHALLENGERS;
    await this.repo.mutate(trial.id, userId, trial.revision, t => {
      Object.assign(t.batches.at(-1), { candidates: [...carried, ...challengers], screening, screeningAttempts: attempts });
      t.status = 'ready';
    });
  }
  async feedback(userId, trialId, batchId, input) {
    return this.repo.mutate(trialId, userId, input.revision, trial => {
      requireIdle(trial);
      const batch = trial.batches.find(b => b.id === batchId);
      if (!batch) throw new NotFoundError('Batch not found');
      if (trial.batches.some(b => b.tournament && b.sourceBatchId === batchId)) throw new ConflictError('This round has already advanced. Review the latest round to change which answers survive.');
      if (input.clear === true) { batch.feedback = null; return; }
      const ids = batch.candidates.filter(c => c.status === 'complete').map(c => c.id);
      const accepted = input.accepted;
      if (!ids.length || !Array.isArray(accepted) || new Set(accepted).size !== accepted.length || accepted.some(id => !ids.includes(id))) throw new ValidationError('Choose valid completed answers');
      if (accepted.length === 0 && input.noneFit !== true) throw new ValidationError('Use None fit to explicitly reject all completed answers');
      if (input.noneFit === true && accepted.length) throw new ValidationError('None fit cannot include accepted answers');
      if (input.favorite && !accepted.includes(input.favorite)) throw new ValidationError('Your favorite must be an accepted answer');
      batch.feedback = { accepted, rejected: ids.filter(id => !accepted.includes(id)), favorite: input.favorite || null,
        noneFit: input.noneFit === true, reviewedAt: new Date().toISOString() };
    });
  }
  async branch(userId, trialId, input) {
    const trial = await this.repo.trial(trialId, userId);
    requireIdle(trial);
    const candidate = trial.batches.flatMap(b => b.candidates).find(c => c.id === input.candidateId && c.status === 'complete');
    if (!candidate || !trial.prepared) throw new ValidationError('Choose a completed answer');
    // A stable derived ID makes network retries of Continue idempotent.
    const id = hash({ userId, trialId, candidateId: candidate.id }).slice(0, 36);
    try { return await this.repo.get(id, userId); } catch (e) { if (!(e instanceof NotFoundError)) throw e; }
    const c = structuredClone(trial.context);
    const message = new ChatMessage({ role: 'user', content: trial.message });
    c.state = { ...c.state, ...trial.prepared.evaluatedState,
      narrativeState: prepareNarrativeState(c.state, trial.prepared.appraisal, message) };
    c.history = [...c.history, { role: 'user', content: trial.message }, { role: 'model', content: candidate.text }].slice(-config.MAX_MEMORY_MESSAGES);
    c.parent = { labId: trial.labId, trialId, candidateId: candidate.id };
    return this.repo.create({ id, title: `${c.character.name} · Continued scene`, snapshot: c, createdAt: new Date().toISOString() }, userId);
  }
  async export(userId, labId) {
    const lab = await this.repo.get(labId, userId);
    const trials = await this.repo.trials(labId, userId);
    return { format: 'response-lab-feedback-v1', exportedAt: new Date().toISOString(), lab, trials,
      note: 'Raw reviewed feedback; no automatic training. Unreviewed, failed, duplicate and automatically screened-out candidates are not user-rejected examples. Carried candidate IDs identify the same answer across rounds: use the latest explicit label, not repeated copies as independent training examples. Keep each contextHash grouped when splitting or weighting a training dataset.' };
  }
}
export const responseLabService = new ResponseLabService();

import { narrativeContext } from './turn-state.js';
import { appraisalService } from './appraisal.service.js';
import { relationshipService } from './relationship.service.js';
import { responsePreferencesService } from './response-preferences.service.js';

// Shared by normal chat and the lab. Callers control persistence; this only prepares a turn.
export async function prepareResponseContext({ character, session, message, query = message, history,
  persona, pinnedMessages, memories, storySummary, provider, evaluate = true, userId = null,
  appraiser = appraisalService, relationships = relationshipService, preferences = responsePreferencesService }) {
  const context = narrativeContext(session, query);
  const appraisal = evaluate ? await appraiser.appraise({ character, session, userText: message.trim(),
    history, memories: context.memories, persona, pinnedMessages, storySummary, retrievedMemories: memories }) : null;
  const evaluatedState = relationships.evaluateAppraisal({ userText: message || '', session, character, appraisal });
  // Review examples steer writing only; they never enter appraisal or story state.
  const writingPreferences = userId ? await preferences.forContext({ userId, characterId: character.id,
    personaId: persona?.id || null, stage: evaluatedState.relationshipStage, mood: evaluatedState.relationshipMood,
    message, setup: storySummary || '' }) : null;
  return { context, appraisal, evaluatedState, aiOptions: {
    requireComplete: true, appraisalManaged: true, narrativeContext: { ...context, scene: appraisal?.scene || context.scene },
    appraisal, provider, persona, pinnedMessages, memories, storySummary, writingPreferences,
    relationship: { affinity: evaluatedState.affinity, trust: evaluatedState.trust, strain: evaluatedState.strain,
      stage: evaluatedState.relationshipStage, mood: evaluatedState.relationshipMood, dynamic: character.relationshipDynamic }
  } };
}

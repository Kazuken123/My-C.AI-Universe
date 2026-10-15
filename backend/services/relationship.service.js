/**
 * RelationshipService Class
 * Implements the Dual-Timescale Emotional Inertia & Strain Model:
 * - Long-term Bond (affinity: -100 to +100) has high inertia and resists single-turn arguments.
 * - Conflict Strain (strain: 0 to 100) accumulates during fights/toxicity; only erodes affinity when sustained (strain >= 65).
 * - Persona-Adaptive Stages support Hate, Scared/Intimidated, Submissive, Neutral, Friend, Crush, Deep Love, and Obsessed.
 */
export class RelationshipService {
  static PRESETS = {
    nemesis: { affinity: -85, trust: -80, stage: 'Hatred / Nemesis', mood: 'Hostile' },
    hostile: { affinity: -45, trust: -40, stage: 'Hostile / Rival', mood: 'Guarded' },
    scared: { affinity: -40, trust: -65, stage: 'Scared / Intimidated', mood: 'Afraid' },
    submissive: { affinity: -20, trust: -30, stage: 'Submissive / Dependent', mood: 'Submissive' },
    cold: { affinity: -20, trust: -20, stage: 'Cold / Guarded', mood: 'Guarded' },
    stranger: { affinity: 0, trust: 0, stage: 'Stranger / Neutral', mood: 'Calm' },
    acquaintance: { affinity: 22, trust: 20, stage: 'Acquaintance / Comrade', mood: 'Calm' },
    friend: { affinity: 48, trust: 50, stage: 'Close Friend / Confidant', mood: 'Warm' },
    crush: { affinity: 65, trust: 55, stage: 'Crush / Infatuated', mood: 'Flustered' },
    lover: { affinity: 80, trust: 80, stage: 'Deep Love / Devoted', mood: 'Warm' },
    obsessed: { affinity: 95, trust: 70, stage: 'Obsessed / Possessive', mood: 'Possessive' }
  };

  /**
   * Infer whether a character's persona leans timid/vulnerable/submissive vs proud/dominant
   */
  detectPersonaVulnerability(character = {}) {
    const text = `${character.personality || ''} ${character.speaking_style || character.speakingStyle || ''} ${character.tagline || ''}`.toLowerCase();
    const submissiveSignals = /\b(timid|shy|submissive|meek|obedient|fragile|insecure|anxious|cowardly|servant|dependent|helpless|vulnerable)\b/i;
    const dominantSignals = /\b(strongest|arrogant|confident|dominant|cold|ruthless|stoic|unyielding|detective|special grade)\b/i;
    if (submissiveSignals.test(text) && !dominantSignals.test(text)) return 'vulnerable';
    return 'resilient';
  }

  /**
   * Resolve the human-readable Relationship Stage from (affinity, trust, strain, character, currentStage)
   */
  resolveStage(optionsOrAffinity = {}, characterIfPositional = {}) {
    let affinity = 0;
    let trust = 0;
    let strain = 0;
    let mood = 'Calm';
    let character = {};
    let currentStage = '';

    if (typeof optionsOrAffinity === 'number') {
      affinity = optionsOrAffinity;
      trust = optionsOrAffinity;
      character = characterIfPositional || {};
    } else if (optionsOrAffinity && typeof optionsOrAffinity === 'object') {
      affinity = optionsOrAffinity.affinity ?? 0;
      trust = optionsOrAffinity.trust ?? affinity;
      strain = optionsOrAffinity.strain ?? 0;
      mood = optionsOrAffinity.mood || 'Calm';
      character = optionsOrAffinity.character || {};
      currentStage = optionsOrAffinity.currentStage || '';
    }

    const personaType = this.detectPersonaVulnerability(character);
    const lowerStage = String(currentStage || '').toLowerCase();

    // Preserve explicit Submissive / Scared state if affinity is negative or low and trust is low
    if (affinity < 15 && trust <= -25) {
      if (mood === 'Afraid' || lowerStage.includes('scared') || (personaType === 'vulnerable' && trust <= -45)) {
        return 'Scared / Intimidated';
      }
      if (mood === 'Submissive' || lowerStage.includes('submissive') || (personaType === 'vulnerable' && strain >= 40)) {
        return 'Submissive / Dependent';
      }
    }

    if (affinity <= -75) return personaType === 'vulnerable' && trust < -50 ? 'Scared / Intimidated' : 'Hatred / Nemesis';
    if (affinity <= -40) return 'Hostile / Bitter';
    if (affinity <= -15) return 'Cold / Guarded';
    if (affinity < 15) return 'Stranger / Neutral';
    if (affinity < 40) return 'Acquaintance / Comrade';
    if (affinity < 60) return 'Close Friend / Confidant';
    if (affinity < 75) return 'Crush / Infatuated';
    if (affinity < 90) return 'Deep Love / Devoted';
    return 'Obsessed / Possessive';
  }

  /**
   * Evaluate a conversation turn using Dual-Timescale Emotional Inertia
   * Returns updated { affinity, trust, strain, relationshipStage, relationshipMood }
   */
  evaluateTurn({ userText = '', aiText = '', session = {}, character = {} }) {
    let affinity = Number(session.affinity ?? character.initialAffinity ?? 0);
    let trust = Number(session.trust ?? affinity);
    let strain = Number(session.strain ?? 0);
    let mood = session.relationshipMood || 'Calm';

    const combinedUser = String(userText || '').toLowerCase();
    const combinedAi = String(aiText || '').toLowerCase();

    // 1. Detect interaction signals in user & AI turn
    const isApologyOrRepair = /\b(sorry|apologize|forgive me|my fault|i didn't mean to|xin lỗi|thứ lỗi|lỗi của anh|lỗi của tôi|đừng giận)\b/i.test(combinedUser);
    const isAffectionate = /\b(love you|care about you|treasure you|hug|kiss|hold your hand|missed you|proud of you|thank you|thương|yêu|nhớ|ôm|cảm ơn|trân trọng)\b/i.test(combinedUser);
    const isSupportive = /\b(help you|here for you|listen to you|protect you|trust you|believe in you|bên cạnh|bảo vệ|tin tưởng)\b/i.test(combinedUser);
    const isArgumentOrFriction = /\b(annoying|shut up|whatever|stop it|ridiculous|stupid|angry|mad at you|argue|why did you|bực mình|vô lý|đáng ghét|im đi|cãi)\b/i.test(combinedUser);
    const isToxicOrCruel = /\b(hate you|worthless|pathetic|disgusting|never want to see you|betray|kill|die|break up|get lost|trash|cút đi|ghét cay ghét đắng|phản bội|vô dụng|chia tay)\b/i.test(combinedUser);
    const isIntimidatingOrDominant = /\b(obey|kneel|submit|you belong to me|do as i say|don't dare|afraid of me|nghe lời|phục tùng|sợ)\b/i.test(combinedUser);

    const aiShowsFear = /\b(trembles|shivers in fear|steps back in terror|afraid|terrified|scared|voice shaking|cowers)\b/i.test(combinedAi);
    const aiShowsSubmission = /\b(lowers head|obeys quietly|submits|at your mercy|whispers obedien|nods meekly)\b/i.test(combinedAi);
    const aiShowsWarmth = /\b(smiles warmly|blushes|laughs softly|leans closer|gentle smile|eyes soften)\b/i.test(combinedAi);
    const aiShowsHurtOrAnger = /\b(glares|scowls|tears well|voice cracks|turns away hurt|snaps back|crosses arms)\b/i.test(combinedAi);

    // Emotional Inertia Damping Factor:
    // Deep bonds (|affinity| >= 65) have high inertia against isolated arguments.
    const isDeepBond = affinity >= 65;

    let affinityDelta = 0;
    let trustDelta = 0;
    let strainDelta = 0;

    if (isToxicOrCruel) {
      // Severe toxicity spikes strain rapidly
      strainDelta += 22;
      trustDelta -= 10;
      if (isDeepBond && strain + strainDelta < 60) {
        // First shock in a deep relationship: hurts deeply & raises strain, minor bond erosion
        affinityDelta -= 3;
        mood = 'Hurt / Heartbroken';
      } else {
        // Unbuffered or sustained toxicity: heavy structural bond erosion
        affinityDelta -= 10;
        mood = aiShowsFear ? 'Afraid' : 'Hostile / Bitter';
      }
    } else if (isApologyOrRepair) {
      // Making up after an argument repairs strain and strengthens the bond
      // Sincere apologies take precedence over friction words (e.g. "I was angry/foolish")
      const hadStrain = strain > 10;
      strainDelta -= 28;
      trustDelta += 5;
      affinityDelta += hadStrain ? 4 : 2;
      mood = (strain + strainDelta <= 20) ? (affinity >= 65 ? 'Warm' : 'Calm') : 'Softening / Reconciling';
    } else if (isIntimidatingOrDominant) {
      strainDelta += 12;
      trustDelta -= 6;
      if (aiShowsSubmission || this.detectPersonaVulnerability(character) === 'vulnerable') {
        mood = 'Submissive';
        affinityDelta -= 2;
      } else if (aiShowsFear) {
        mood = 'Afraid';
        affinityDelta -= 5;
      } else {
        mood = 'Guarded';
        affinityDelta -= 4;
      }
    } else if (isArgumentOrFriction) {
      // Normal argument / lovers' quarrel
      strainDelta += 12;
      if (isDeepBond && strain + strainDelta < 65) {
        // KEY REALISM RULE: Arguing as a couple does NOT reduce love unless strain is already critical!
        affinityDelta = 0;
        trustDelta -= 1;
        mood = 'Quarreling / Heated';
      } else if (strain + strainDelta >= 65) {
        // Chronic, unresolved fighting finally starts eroding the relationship
        affinityDelta -= 5;
        trustDelta -= 4;
        mood = 'Exhausted / Resentful';
      } else {
        affinityDelta -= 2;
        trustDelta -= 2;
        mood = 'Frustrated / Guarded';
      }
    } else if (isAffectionate) {
      strainDelta -= 12;
      trustDelta += 3;
      // Diminishing returns near +100 so Obsessed takes real buildup
      affinityDelta += affinity >= 85 ? 2 : 4;
      mood = affinity >= 85 ? 'Possessive' : (aiShowsWarmth ? 'Warm' : 'Flustered');
    } else if (isSupportive) {
      strainDelta -= 10;
      trustDelta += 4;
      affinityDelta += 3;
      mood = 'Warm';
    } else {
      // Natural neutral/everyday interaction gently cools down strain over time
      strainDelta -= 4;
      affinityDelta += affinity >= 0 && affinity < 50 ? 1 : 0;
      if (aiShowsWarmth) mood = 'Warm';
      else if (aiShowsHurtOrAnger && strain > 20) mood = 'Guarded';
      else if (strain < 15) mood = 'Calm';
    }

    // Clamp values
    affinity = Math.max(-100, Math.min(100, Math.round(affinity + affinityDelta)));
    trust = Math.max(-100, Math.min(100, Math.round(trust + trustDelta)));
    strain = Math.max(0, Math.min(100, Math.round(strain + strainDelta)));

    const relationshipStage = this.resolveStage({
      affinity,
      trust,
      strain,
      mood,
      character,
      currentStage: session.relationshipStage
    });

    return {
      affinity,
      trust,
      strain,
      relationshipStage,
      relationshipMood: mood
    };
  }
}

export const relationshipService = new RelationshipService();

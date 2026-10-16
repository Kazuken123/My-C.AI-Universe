/**
 * RelationshipService Class
 * Implements Psychological Appraisal + Dual-Timescale Emotional Inertia & Stage Hysteresis:
 * 1. Subtext Intent Appraisal: Distinguishes friendly sparring/training ('spar_or_play'),
 *    lovers' quarrels ('lovers_quarrel'), and heartfelt reconciliation ('rupture_repair') from real malice.
 * 2. Rupture-and-Repair Catharsis: Making up after high conflict strain converts resolved tension
 *    into deeper Trust and Affinity ('Tender / Reconciled') rather than resetting to neutral.
 * 3. Stage Hysteresis: Prevents established Lovers or Close Friends from being demoted to lower stages
 *    during temporary arguments unless sustained strain or betrayal occurs.
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
   * Extract and strip the hidden [[REL_STATE: {...}]] tag from raw AI output.
   * @param {string} rawText - Raw AI response string
   * @returns {{ cleanText: string, llmState: Object|null }}
   */
  extractAndStripStateTag(rawText = '') {
    const text = String(rawText || '');
    const regex = /\[\[REL_STATE:\s*(\{[\s\S]*?\})\s*\]\]/i;
    const match = text.match(regex);

    let llmState = null;
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && typeof parsed === 'object') {
          llmState = {
            intent: typeof parsed.intent === 'string' ? parsed.intent.trim().toLowerCase() : null,
            affinityDelta: Number.isFinite(Number(parsed.affinityDelta)) ? Number(parsed.affinityDelta) : null,
            trustDelta: Number.isFinite(Number(parsed.trustDelta)) ? Number(parsed.trustDelta) : null,
            strainDelta: Number.isFinite(Number(parsed.strainDelta)) ? Number(parsed.strainDelta) : null,
            mood: typeof parsed.mood === 'string' && parsed.mood.trim() ? parsed.mood.trim() : null
          };
        }
      } catch {
        // Ignore malformed JSON and rely on fallback
      }
    }

    const cleanText = text
      .replace(/\[\[REL_STATE:\s*\{[\s\S]*?\}\s*\]\]/gi, '')
      .replace(/\[\[REL_STATE:[\s\S]*$/gi, '')
      .trim();

    return { cleanText: cleanText || text.trim(), llmState };
  }

  /**
   * Return the natural baseline mood for a given affinity & strain level
   * while preserving special emotional states like 'Tender / Reconciled' or 'Playful / Competitive'.
   */
  getDefaultMoodForStage(affinity = 0, strain = 0, currentMood = 'Calm') {
    if (strain >= 60) return 'Hurt / Heartbroken';
    if (strain >= 40) return 'Quarreling / Heated';
    if (currentMood === 'Tender / Reconciled' && strain < 25) return 'Tender / Reconciled';
    if (currentMood === 'Playful / Competitive' && strain < 25) return 'Playful / Competitive';
    if (affinity >= 90) return 'Possessive';
    if (affinity >= 75) return 'Warm';
    if (affinity >= 60) {
      return (currentMood === 'Warm' || currentMood === 'Flustered') ? currentMood : 'Flustered';
    }
    if (affinity >= 40) return 'Warm';
    if (affinity <= -40) return 'Hostile';
    if (affinity <= -15) return 'Guarded';
    return 'Calm';
  }

  /**
   * Resolve mood for a regenerated variant WITHOUT altering affinity, trust, strain, or stage.
   */
  resolveRegenerateMood({ aiText = '', session = {}, llmState = null }) {
    const affinity = Number(session.affinity ?? 0);
    const strain = Number(session.strain ?? 0);
    const currentMood = session.relationshipMood || 'Calm';

    if (llmState && llmState.mood) {
      if (affinity >= 60 && strain < 35 && (llmState.mood === 'Calm' || llmState.mood === 'Guarded')) {
        return this.getDefaultMoodForStage(affinity, strain, currentMood);
      }
      return llmState.mood;
    }

    const combinedAi = String(aiText || '').toLowerCase();
    if (/\b(smiles warmly|blushes|laughs softly|leans closer|gentle smile|eyes soften|ears turn red|cheeks flush|heart races)\b/i.test(combinedAi)) {
      return affinity >= 60 && affinity < 75 ? 'Flustered' : 'Warm';
    }
    return this.getDefaultMoodForStage(affinity, strain, currentMood);
  }

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
   * Resolve the human-readable Relationship Stage with Hysteresis (Anti-Demotion Buffer)
   * so temporary arguments don't demote Lovers to Crush or Friends to Strangers.
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

    if (affinity < 15 && trust <= -25) {
      if (mood === 'Afraid' || lowerStage.includes('scared') || (personaType === 'vulnerable' && trust <= -45)) {
        return 'Scared / Intimidated';
      }
      if (mood === 'Submissive' || lowerStage.includes('submissive') || (personaType === 'vulnerable' && strain >= 40)) {
        return 'Submissive / Dependent';
      }
    }

    // STAGE HYSTERESIS: Once a high relationship milestone is reached, require a significant drop
    // (or extreme strain >= 85) before demoting the relationship stage.
    if (currentStage === 'Obsessed / Possessive' && affinity >= 84 && strain < 85) {
      return 'Obsessed / Possessive';
    }
    if (currentStage === 'Deep Love / Devoted' && affinity >= 64 && affinity < 90 && strain < 85) {
      return 'Deep Love / Devoted';
    }
    if (currentStage === 'Crush / Infatuated' && affinity >= 52 && affinity < 75 && strain < 80) {
      return 'Crush / Infatuated';
    }
    if (currentStage === 'Close Friend / Confidant' && affinity >= 32 && affinity < 60 && strain < 80) {
      return 'Close Friend / Confidant';
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

  #stripNegatedPhrases(text = '') {
    return String(text)
      .replace(/\b(?:don't|do not|doesn't|did not|didn't|never|not|no longer|hardly)\s+(?:\w+\s+){0,2}(love|care|like|trust|forgive|hate|angry|mad|worthless|pathetic|stupid|disgusting|afraid|scared)\b/gi, ' [negated] ')
      .replace(/\b(?:không|chẳng|chưa từng|đừng|đâu có|hết)\s+(?:còn\s+|hề\s+|bao giờ\s+|nghĩ mình\s+|tự thấy\s+)?(yêu|thương|nhớ|tin|thích|ghét|giận|vô dụng|đáng ghét|sợ)\b/gi, ' [negated] ');
  }

  /**
   * Evaluate a conversation turn using Psychological Appraisal + Catharsis + Stage Hysteresis
   */
  evaluateTurn({ userText = '', aiText = '', session = {}, character = {}, llmState = null }) {
    let affinity = Number(session.affinity ?? character.initialAffinity ?? 0);
    let trust = Number(session.trust ?? affinity);
    let strain = Number(session.strain ?? 0);
    let mood = session.relationshipMood || 'Calm';

    const rawUser = String(userText || '').toLowerCase();
    const combinedUser = this.#stripNegatedPhrases(rawUser);
    const combinedAi = String(aiText || '').toLowerCase();

    // Detect contextual signals (Sparring/Training vs Apology/Repair vs Real Betrayal)
    const isSparringOrTraining = (llmState?.intent === 'spar_or_play') ||
      /\b(spar|sparring|train|training|practice match|duel me|warm-up|don't hold back|show me what you've got|test your strength|test my strength|tập luyện|đấu tập|giao đấu|thử sức)\b/i.test(`${rawUser} ${combinedAi}`);

    const isColdRejection = /\b(?:don't love you|do not love you|never loved you|no longer care about you|we are done|break up with you|hết yêu|không còn yêu|không thương|chia tay đi)\b/i.test(rawUser);
    const isReassurance = /\b(?:you are not worthless|you're not worthless|not your fault|don't blame yourself|đừng tự trách|không phải lỗi của em|không phải lỗi của bạn|không hề vô dụng)\b/i.test(rawUser);
    const isApologyOrRepair = (llmState?.intent === 'rupture_repair') ||
      /\b(sorry|apologize|forgive me|my fault|i didn't mean to|i was wrong|make it up to you|xin lỗi|thứ lỗi|lỗi của anh|lỗi của em|lỗi của tôi|đừng giận|làm lành)\b/i.test(combinedUser);

    // Ensure friendly sparring never triggers toxic/cruel flags even if combat words ("kill", "crush", "destroy") are used
    const isToxicOrCruel = !isSparringOrTraining && !isReassurance && (
      llmState?.intent === 'hostile_or_betrayal' ||
      isColdRejection ||
      /\b(hate you|worthless|pathetic|disgusting|never want to see you|betray|get lost|you're trash|cút đi|ghét cay ghét đắng|phản bội|vô dụng)\b/i.test(combinedUser)
    );

    const isDeepBond = affinity >= 60;
    const isFriendOrHigher = affinity >= 25;
    const isHostileOrDistrustful = affinity <= -40 || trust <= -40;

    let affinityDelta = 0;
    let trustDelta = 0;
    let strainDelta = 0;

    // CASE 1: SPARRING / TRAINING / PLAYFUL RIVALRY (Builds camaraderie and trust, zero hostility!)
    if (isSparringOrTraining && !isHostileOrDistrustful) {
      strainDelta = -6;
      affinityDelta = affinity >= 80 ? 1 : 2;
      trustDelta = 3;
      mood = 'Playful / Competitive';
    }
    // CASE 2: RUPTURE & REPAIR (Apologizing / Making Up After a Fight -> Deeper Understanding!)
    else if (isApologyOrRepair && !isHostileOrDistrustful) {
      const priorStrain = strain;
      if (priorStrain >= 20) {
        // CATHARSIS / MAKE-UP BONUS: Surviving a fight and apologizing makes the bond & trust DEEPER than before!
        const catharsisBonus = Math.min(4, Math.ceil(priorStrain / 18));
        strainDelta = -Math.max(30, Math.round(priorStrain * 0.75));
        affinityDelta = 3 + catharsisBonus; // +4 to +7 affinity breakthrough
        trustDelta = 5 + catharsisBonus;    // +6 to +9 deeper mutual trust
        mood = (priorStrain + strainDelta <= 22) ? 'Tender / Reconciled' : 'Softening / Reconciling';
      } else {
        strainDelta = -15;
        affinityDelta = 2;
        trustDelta = 3;
        mood = isDeepBond ? 'Tender / Reconciled' : 'Warm';
      }
    }
    // CASE 3: LLM SUBTEXT EVALUATION (When LLM provides [[REL_STATE]])
    else if (llmState && (llmState.affinityDelta !== null || llmState.mood !== null)) {
      const rawAff = llmState.affinityDelta ?? 0;
      const rawTrust = llmState.trustDelta ?? rawAff;
      const rawStrain = llmState.strainDelta ?? (rawAff >= 0 ? -4 : 6);

      if (llmState.intent === 'lovers_quarrel' || (isDeepBond && rawAff < 0 && !isToxicOrCruel && strain < 65)) {
        // Lovers' quarrel: raises emotional strain & changes mood, but protects deep love from eroding
        affinityDelta = 0;
        trustDelta = Math.max(-1, rawTrust);
        strainDelta = Math.max(6, Math.min(15, rawStrain));
        mood = (strain + strainDelta >= 45) ? 'Hurt / Heartbroken' : 'Quarreling / Heated';
      } else {
        affinityDelta = Math.max(-8, Math.min(5, rawAff));
        trustDelta = Math.max(-8, Math.min(6, rawTrust));
        strainDelta = Math.max(-25, Math.min(20, rawStrain));

        if (llmState.mood) {
          if (isDeepBond && strain + strainDelta < 30 && (llmState.mood === 'Calm' || llmState.mood === 'Guarded')) {
            mood = this.getDefaultMoodForStage(affinity + affinityDelta, Math.max(0, strain + strainDelta), mood);
          } else {
            mood = llmState.mood;
          }
        } else {
          mood = this.getDefaultMoodForStage(affinity + affinityDelta, Math.max(0, strain + strainDelta), mood);
        }
      }
    }
    // CASE 4: DETERMINISTIC FALLBACK (If LLM omits [[REL_STATE]])
    else {
      const isAffectionate = !isColdRejection && /\b(love you|care about you|treasure you|hug|kiss|hold your hand|missed you|proud of you|thank you|cute|beautiful|handsome|thương|yêu|nhớ|ôm|cảm ơn|trân trọng|dễ thương|xinh)\b/i.test(combinedUser);
      const isSupportive = isReassurance || /\b(help you|here for you|listen to you|protect you|trust you|believe in you|understand you|bên cạnh|bảo vệ|tin tưởng|thấu hiểu)\b/i.test(combinedUser);
      const isArgumentOrFriction = /\b(annoying|shut up|whatever|stop it|ridiculous|stupid|angry|mad at you|argue|why did you|bực mình|vô lý|đáng ghét|im đi|cãi)\b/i.test(combinedUser);
      const isIntimidatingOrDominant = /\b(obey|kneel|submit|you belong to me|do as i say|don't dare|afraid of me|nghe lời|phục tùng|sợ)\b/i.test(combinedUser);

      const aiShowsFear = /\b(trembles|shivers in fear|steps back in terror|afraid|terrified|scared|voice shaking|cowers)\b/i.test(combinedAi);
      const aiShowsSubmission = /\b(lowers head|obeys quietly|submits|at your mercy|whispers obedien|nods meekly)\b/i.test(combinedAi);
      const aiShowsWarmth = /\b(smiles warmly|blushes|laughs softly|leans closer|gentle smile|eyes soften|cheeks flush|ears turn red|heart races)\b/i.test(combinedAi);
      const aiShowsHurtOrAnger = !isDeepBond && !isFriendOrHigher && /\b(glares|scowls|tears well|voice cracks|turns away hurt|snaps back)\b/i.test(combinedAi);

      if (isToxicOrCruel) {
        if (isColdRejection) {
          strainDelta += 20;
          trustDelta -= 6;
          affinityDelta -= (isDeepBond && strain + strainDelta < 65 ? 2 : 8);
          mood = 'Hurt / Heartbroken';
        } else {
          strainDelta += 22;
          trustDelta -= 10;
          if (isDeepBond && strain + strainDelta < 65) {
            affinityDelta -= 3;
            mood = 'Hurt / Heartbroken';
          } else {
            affinityDelta -= 10;
            mood = aiShowsFear ? 'Afraid' : 'Hostile / Bitter';
          }
        }
      } else if (isApologyOrRepair) {
        strainDelta -= 8;
        trustDelta += 2;
        affinityDelta += 1;
        mood = 'Suspicious / Guarded';
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
          mood = isDeepBond ? 'Flustered' : 'Guarded';
          affinityDelta -= isDeepBond ? 0 : 4;
        }
      } else if (isArgumentOrFriction) {
        if (isDeepBond && strain + 10 < 65) {
          // Lovers' quarrel: increases strain so apology later triggers Catharsis, but keeps affinity intact!
          strainDelta += 12;
          affinityDelta = 0;
          trustDelta = -1;
          mood = strain + strainDelta >= 40 ? 'Hurt / Heartbroken' : 'Quarreling / Heated';
        } else if (strain + 12 >= 65) {
          strainDelta += 12;
          affinityDelta -= 5;
          trustDelta -= 4;
          mood = 'Exhausted / Resentful';
        } else {
          strainDelta += 12;
          affinityDelta -= 2;
          trustDelta -= 2;
          mood = 'Frustrated / Guarded';
        }
      } else if (isAffectionate) {
        if (isHostileOrDistrustful) {
          strainDelta -= 6;
          trustDelta += 2;
          affinityDelta += 1;
          mood = 'Suspicious / Guarded';
        } else {
          strainDelta -= 12;
          trustDelta += 3;
          affinityDelta += affinity >= 85 ? 2 : 4;
          mood = affinity >= 85 ? 'Possessive' : (affinity >= 60 && affinity < 75 ? 'Flustered' : 'Warm');
        }
      } else if (isSupportive) {
        if (isHostileOrDistrustful) {
          strainDelta -= 8;
          trustDelta += 3;
          affinityDelta += 2;
          mood = 'Guarded';
        } else {
          strainDelta -= 10;
          trustDelta += 4;
          affinityDelta += 3;
          mood = affinity >= 60 && affinity < 75 ? 'Flustered' : 'Warm';
        }
      } else {
        if (!isDeepBond && aiShowsFear) {
          strainDelta += 6;
          trustDelta -= 3;
          mood = 'Afraid';
        } else if (!isDeepBond && aiShowsSubmission) {
          mood = 'Submissive';
        } else if (aiShowsHurtOrAnger) {
          strainDelta += 6;
          mood = strain + strainDelta >= 45 ? 'Hurt / Heartbroken' : 'Guarded';
        } else if (aiShowsWarmth) {
          strainDelta -= 6;
          affinityDelta += affinity >= -10 && affinity < 60 ? 1 : 0;
          mood = affinity >= 60 && affinity < 75 ? 'Flustered' : 'Warm';
        } else {
          strainDelta -= 4;
          affinityDelta += affinity >= 0 && affinity < 50 ? 1 : 0;
          mood = this.getDefaultMoodForStage(affinity + affinityDelta, Math.max(0, strain + strainDelta), mood);
        }
      }
    }

    // Clamp final values
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

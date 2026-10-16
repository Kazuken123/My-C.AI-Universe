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
// Persona receptivity profiles:
// pacing:
// - 'slow_burn' (Mưa dầm thấm lâu): Affinity bị khóa theo Trust. Hành động cơ bản chỉ tích lũy Trust trước.
// - 'guarded' (Lạnh lùng / Khó gần): Tăng cực chậm ở đầu, đòi hỏi Trust rất cao mới mở lòng.
// - 'spark_prone' (Dễ trúng tiếng sét ái tình): Tử tế cơ bản vẫn không ăn thua, nhưng nếu chạm đúng khoảnh khắc cao trào (high_stakes) sẽ bùng nổ cảm xúc.
export const PERSONA_RECEPTIVITY = {
  // Kana: Mưa dầm thấm lâu điển hình — ngoài miệng sắc sảo, cần sự đồng hành và tin tưởng bền bỉ mới dám yêu
  '1766394139616': {
    pacing: 'slow_burn',
    flatteryMultiplier: 0.4,
    actionMultiplier: 1.2,
    earlyStageArmor: 0.85,
    deepIntimacyArmor: 0.6,
    minTrustForCrush: 50,      // Phải tích lũy đủ Trust >= 50 qua thời gian mới lên được Crush
    maxAffinityLeadOverTrust: 12 // Affinity không bao giờ vượt quá Trust + 12 điểm
  },
  // Gojo: Dễ thân lúc đầu (bạn bè), nhưng cực kỳ khó chạm tới trái tim thật (cần thời gian + biến cố lớn)
  '1766160797313': {
    pacing: 'guarded',
    flatteryMultiplier: 0.25,
    actionMultiplier: 0.9,
    earlyStageArmor: 1.3,
    deepIntimacyArmor: 0.35,
    minTrustForCrush: 60,      // Đòi hỏi sự tin tưởng tuyệt đối mới mở lòng yêu
    maxAffinityLeadOverTrust: 15
  },
  // Mẫu nhân vật "Tiếng sét ái tình" (có thể gán ID nhân vật lãng mạn vào đây)
  spark_archetype: {
    pacing: 'spark_prone',
    flatteryMultiplier: 0.6,
    actionMultiplier: 1.15,
    earlyStageArmor: 1.0,
    deepIntimacyArmor: 0.8,
    minTrustForCrush: 25,      // Có thể rung động (Crush) ngay cả khi Trust còn thấp
    maxAffinityLeadOverTrust: 35 // Cho phép Affinity vượt xa Trust khi trúng "tiếng sét ái tình"
  },
  default: {
    pacing: 'slow_burn',
    flatteryMultiplier: 0.5,
    actionMultiplier: 1.0,
    earlyStageArmor: 0.9,
    deepIntimacyArmor: 0.7,
    minTrustForCrush: 45,
    maxAffinityLeadOverTrust: 15
  }
};

const EFFORT_RANK = { none: 0, low: 1, meaningful: 2, milestone: 3 };

export const STAGE_GATES = [
  { name: 'Stranger / Neutral',        min: 0,  max: 14, ceilingCap: 14, breakthroughEffort: 'low',        requireMilestoneIntent: false, minTrust: 0  },
  { name: 'Acquaintance / Comrade',    min: 15, max: 39, ceilingCap: 39, breakthroughEffort: 'low',        requireMilestoneIntent: false, minTrust: 12 },
  { name: 'Close Friend / Confidant',  min: 40, max: 59, ceilingCap: 58, breakthroughEffort: 'meaningful', requireMilestoneIntent: false, minTrust: 30 },
  { name: 'Crush / Infatuated',        min: 60, max: 74, ceilingCap: 73, breakthroughEffort: 'milestone',  requireMilestoneIntent: true,  minTrust: 50 },
  { name: 'Deep Love / Devoted',       min: 75, max: 89, ceilingCap: 88, breakthroughEffort: 'milestone',  requireMilestoneIntent: true,  minTrust: 70 },
  { name: 'Obsessed / Possessive',     min: 90, max: 100, ceilingCap: 100, breakthroughEffort: 'milestone', requireMilestoneIntent: true,  minTrust: 80 }
];

export function isPassiveOrMaintenanceTurn(relState = {}, userMessageText = '') {
  const effort = relState.userEffort || 'low';
  const intent = relState.intent || 'stage_maintenance';
  const userText = String(userMessageText || '').trim();
  const wordCount = userText.split(/\s+/).filter(Boolean).length;
  const hasAsteriskAction = /\*[^*]+\*/.test(userText);

  if (intent === 'stage_maintenance' || effort === 'none') return true;
  if (wordCount <= 4 && !hasAsteriskAction && effort !== 'milestone') return true;
  return false;
}

/**
 * Deterministic Multi-Factor Evaluation:
 * Returns { affinityDelta, trustBonus, sparkTriggered } so basic actions can build Trust over time ("Mưa dầm thấm lâu")
 * when Affinity is capped by time/stage limits.
 */
export function computeContextualProgression({
  characterId = '',
  currentAffinity = 0,
  currentTrust,
  relState = {},
  userMessageText = ''
}) {
  let rawDelta = Number(relState.affinityDelta) || 0;
  if (rawDelta <= 0) {
    return { affinityDelta: rawDelta, trustBonus: 0, sparkTriggered: false };
  }

  const effectiveTrust = (currentTrust !== undefined && currentTrust !== null)
    ? Number(currentTrust)
    : currentAffinity;

  const profile = PERSONA_RECEPTIVITY[characterId] || PERSONA_RECEPTIVITY.default;
  const effort = relState.userEffort || 'low';
  const stakes = relState.contextStakes || 'mundane';
  const intent = relState.intent || 'stage_maintenance';

  // 1. User-Agency & Passive Turn Guard
  if (isPassiveOrMaintenanceTurn(relState, userMessageText)) {
    return { affinityDelta: 0, trustBonus: 0, sparkTriggered: false };
  }

  // 2. BASIC ACTION SATURATION (Chống cày điểm bằng hành động tử tế cơ bản):
  // Khi đã là Bạn thân (Affinity >= 45), những hành động đời thường (mundane) hoặc lời nói xã giao (low)
  // KHÔNG làm tăng tình yêu (Affinity = 0), mà chỉ bồi đắp niềm tin (Trust +1) -> Đúng chất "Mưa dầm thấm lâu"!
  if (currentAffinity >= 45 && stakes === 'mundane' && effort !== 'milestone') {
    return {
      affinityDelta: 0,
      trustBonus: effort === 'meaningful' ? 1 : 0,
      sparkTriggered: false
    };
  }

  // 3. CƠ CHẾ "TIẾNG SÉT ÁI TÌNH" (Coup de Foudre / Rare Spark):
  // Chỉ kích hoạt khi: Đang ở giai đoạn đầu (< 55), nhưng User tạo ra một khoảnh khắc Đột phá (milestone)
  // trong bối cảnh Cao trào (high_stakes).
  const isLoveAtFirstSightSpark =
    currentAffinity < 55 &&
    effort === 'milestone' &&
    stakes === 'high_stakes' &&
    (intent === 'milestone_breakthrough' || intent === 'rupture_repair' || intent === 'affection_or_support');

  if (isLoveAtFirstSightSpark) {
    if (profile.pacing === 'spark_prone') {
      // Nhân vật dễ trúng tiếng sét ái tình: Bùng nổ rung động (+8), nhảy thẳng vào vùng chớm Crush
      return { affinityDelta: 8, trustBonus: 2, sparkTriggered: true };
    }
    if (profile.pacing === 'slow_burn') {
      // Nhân vật mưa dầm thấm lâu: Bị chấn động tâm lý (+4 Affinity, +4 Trust), ấn tượng sâu sắc nhưng chưa yêu ngay
      return { affinityDelta: 4, trustBonus: 4, sparkTriggered: true };
    }
    // Nhân vật lạnh lùng / phòng thủ cao (guarded): Chỉ mở khóa sự chú ý (+2 Affinity, +3 Trust)
    return { affinityDelta: 2, trustBonus: 3, sparkTriggered: false };
  }

  // 4. Effort Base Cap cho các lượt tương tác bình thường
  const effortCaps = { none: 0, low: 1.0, meaningful: 2.2, milestone: 4.0 };
  rawDelta = Math.min(rawDelta, effortCaps[effort] ?? 1.0);

  // 5. Context Stakes Multiplier
  const stakesMultiplier = stakes === 'high_stakes' ? 1.35 : stakes === 'shared_moment' ? 1.0 : 0.5;

  // 6. Persona Armor Multiplier
  const stageArmor = currentAffinity >= 45 ? profile.deepIntimacyArmor : profile.earlyStageArmor;
  const actionTypeMult = effort === 'low' ? profile.flatteryMultiplier : profile.actionMultiplier;

  // 7. Crush Resonance Boost (rung động bên trong vùng Crush 60-73)
  const inCrushBand = currentAffinity >= 60 && currentAffinity <= 73;
  const crushResonance = (inCrushBand && (effort === 'meaningful' || effort === 'milestone')) ? 1.2 : 1.0;

  let scaledDelta = rawDelta * stakesMultiplier * stageArmor * actionTypeMult * crushResonance;
  let roundedDelta = Math.round(scaledDelta);
  if (roundedDelta === 0) {
    if (effort === 'milestone') {
      roundedDelta = 1;
    } else if (effort === 'meaningful' && stakes !== 'mundane') {
      roundedDelta = 1;
    } else if (effort === 'low' && currentAffinity < 60 && stakes !== 'mundane') {
      roundedDelta = 1;
    }
  }

  let trustBonus = 0;

  // 8. RÀNG BUỘC "MƯA DẦM THẤM LÂU" (Trust-Gated Affinity):
  // Affinity không được phép bỏ xa Trust quá mức cho phép của từng tính cách.
  // Nếu Affinity chạm trần của Trust, điểm dư sẽ chuyển thành Trust Bonus (bồi đắp niềm tin trước!).
  const maxAllowedByTrust = effectiveTrust + (profile.maxAffinityLeadOverTrust ?? 15);
  if (currentAffinity + roundedDelta > maxAllowedByTrust) {
    const allowedAff = Math.max(0, maxAllowedByTrust - currentAffinity);
    if (roundedDelta > allowedAff) {
      trustBonus = 1;
    }
    roundedDelta = allowedAff;
    if (roundedDelta === 0) {
      return { affinityDelta: 0, trustBonus, sparkTriggered: false };
    }
  }

  // 9. Stage Equilibrium & Hard Ceiling Gate (Kiểm tra cả Effort, Intent VÀ MinTrust để qua màn)
  const currentGate = STAGE_GATES.find(g => currentAffinity >= g.min && currentAffinity <= g.max);
  if (currentGate) {
    if (currentAffinity >= 60 && effort === 'low') {
      return { affinityDelta: 0, trustBonus: 0, sparkTriggered: false };
    }

    const projected = currentAffinity + roundedDelta;
    const requiredTrustForNextStage =
      currentGate.name === 'Close Friend / Confidant'
        ? Math.max(currentGate.minTrust, profile.minTrustForCrush ?? 50)
        : currentGate.minTrust;

    const meetsEffort = (EFFORT_RANK[effort] ?? 0) >= (EFFORT_RANK[currentGate.breakthroughEffort] ?? 1);
    const meetsIntent = !currentGate.requireMilestoneIntent || intent === 'milestone_breakthrough';
    const meetsTrust = effectiveTrust >= requiredTrustForNextStage;
    const isBreakthrough = meetsEffort && meetsIntent && meetsTrust;

    if (projected > currentGate.ceilingCap) {
      if (!isBreakthrough) {
        // Nếu bị chặn lại ở cổng (ví dụ: ở 58 Close Friend vì chưa đủ Trust = 50 để lên Crush),
        // khóa Affinity ở 58 nhưng cộng +1 Trust để "mưa dầm thấm lâu" dần dần mở cổng!
        const clampedAff = Math.max(0, currentGate.ceilingCap - currentAffinity);
        return {
          affinityDelta: clampedAff,
          trustBonus: !meetsTrust ? 1 : trustBonus,
          sparkTriggered: false
        };
      }
      const targetMax = Math.min(100, currentGate.max + 1);
      const minToCrossStage = targetMax - currentAffinity;
      if (roundedDelta < minToCrossStage) {
        return { affinityDelta: minToCrossStage, trustBonus: 1, sparkTriggered: false };
      }
    }
  }

  return { affinityDelta: roundedDelta, trustBonus, sparkTriggered: false };
}

export function computeContextualAffinityDelta(args) {
  return computeContextualProgression(args).affinityDelta;
}

/**
 * Stream tail holdback buffer to eliminate [[REL_STATE: ...]] tag flicker during SSE streaming.
 * Holds back potential tag prefixes at chunk boundaries and suppresses the entire tag when detected.
 * @param {Function} emit - Callback receiving safe text chunks to forward to SSE client
 */
export function createStreamTailFilter(emit) {
  let pendingTail = '';
  let insideRelStateTag = false;

  return {
    push(incomingChunk) {
      if (!incomingChunk) return;
      pendingTail += incomingChunk;

      const lower = pendingTail.toLowerCase();
      if (insideRelStateTag || lower.includes('[[rel_state')) {
        insideRelStateTag = true;
        const prefixIndex = lower.indexOf('[[rel_state');
        if (prefixIndex > 0) {
          const preText = pendingTail.slice(0, prefixIndex);
          if (preText.trim()) {
            emit(preText);
          }
          pendingTail = pendingTail.slice(prefixIndex);
        }
        return;
      }

      // Check if tail ends with the beginning of a potential tag (e.g., "\n\n[[", "[[REL_", "[")
      const possibleTagStart = pendingTail.match(/(\n?\s*\[\[[A-Za-z_]*|\n?\s*\[)$/);
      if (possibleTagStart) {
        const safeLength = possibleTagStart.index;
        if (safeLength > 0) {
          emit(pendingTail.slice(0, safeLength));
          pendingTail = pendingTail.slice(safeLength);
        }
        return;
      }

      emit(pendingTail);
      pendingTail = '';
    },
    flush() {
      // If the stream ended and the held tail was not a hidden tag, emit it
      if (!insideRelStateTag && pendingTail.length > 0) {
        emit(pendingTail);
      }
      pendingTail = '';
    }
  };
}

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
            userEffort: typeof parsed.userEffort === 'string' ? parsed.userEffort.trim().toLowerCase() : 'low',
            contextStakes: typeof parsed.contextStakes === 'string' ? parsed.contextStakes.trim().toLowerCase() : 'mundane',
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
        let trustBonus = 0;
        if (rawAff > 0) {
          const progression = computeContextualProgression({
            characterId: character.id,
            currentAffinity: affinity,
            currentTrust: trust,
            relState: llmState,
            userMessageText: userText
          });
          affinityDelta = progression.affinityDelta;
          trustBonus = progression.trustBonus || 0;
        } else {
          affinityDelta = Math.max(-8, Math.min(0, rawAff));
        }

        if (rawTrust < 0) {
          trustDelta = Math.max(-8, Math.min(0, rawTrust));
        } else if (isPassiveOrMaintenanceTurn(llmState, userText)) {
          trustDelta = 0;
        } else {
          trustDelta = Math.max(0, Math.min(6, rawTrust + trustBonus));
        }
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

import { createHash } from 'node:crypto';
export const RELATIONSHIP_KEYS = ['affinity', 'trust', 'strain', 'relationshipStage', 'relationshipMood'];
export function snapshot(session) {
    return structuredClone(Object.fromEntries([...RELATIONSHIP_KEYS, 'narrativeState'].map(k => [k, session[k] ?? (k === 'narrativeState' ? {} : null)])));
}
export function textFingerprint(text) {
    return createHash('sha256').update(String(text).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex');
}
export const memoryKey = item => textFingerprint(`${item.kind}:${item.content}`);
export function activeMemories(state = {}) {
    const forgotten = new Set(state.forgottenMemoryKeys || []);
    return (state.memories || []).filter(item => !forgotten.has(memoryKey(item)));
}
export function prepareNarrativeState(session, appraisal, message) {
    const state = structuredClone(session.narrativeState || {});
    const evidence = { messageId: message.id, variantId: message.variants[message.selectedVariantIndex || 0].id, fingerprint: textFingerprint(message.content) };
    state.recentActions = [...(state.recentActions || []), evidence.fingerprint].slice(-12);
    if (!appraisal) {
        state.lastChange = 'No verified relationship change.';
        return state;
    }
    state.emotion = { mood: appraisal.mood, intensity: appraisal.intensity, cause: appraisal.reason, ...evidence };
    state.lastChange = appraisal.reason;
    const replaced = new Set((appraisal.memories || []).map(m => m.replaces).filter(Boolean));
    const memories = activeMemories(state).filter(m => !replaced.has(memoryKey(m)));
    for (const item of appraisal.memories || [])
        if (!(state.forgottenMemoryKeys || []).includes(memoryKey(item)) && !memories.some(m => m.kind === item.kind && m.content === item.content))
            memories.push({ ...item, ...evidence, createdAt: message.createdAt });
    state.memories = memories.slice(-100);
    if (appraisal.scene)
        state.scene = { ...appraisal.scene, ...evidence };
    return state;
}
export function narrativeContext(session, query = '') {
    const state = session.narrativeState || {};
    const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const score = m => (m.kind === 'promise' ? 3 : 0) + [...terms].filter(t => m.content.toLowerCase().includes(t)).length;
    return { scene: state.scene || null, emotion: state.emotion || null, memories: [...activeMemories(state)].sort((a, b) => score(b) - score(a) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8).map(m => ({ ...m, key: memoryKey(m) })) };
}

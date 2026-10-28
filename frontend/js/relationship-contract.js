// Canonical API vocabulary shared by server and both clients.
/** @type {Array<{stage:string, affinity:number, trust:number, label:string}>} */
export const RELATIONSHIP_PRESETS = [
    ['Hatred / Nemesis', -85, -80], ['Hostile / Bitter', -45, -40], ['Scared / Intimidated', -40, -65],
    ['Submissive / Dependent', -20, -30], ['Cold / Guarded', -20, -20], ['Stranger / Neutral', 0, 0],
    ['Acquaintance / Comrade', 22, 20], ['Close Friend / Confidant', 48, 50], ['Crush / Infatuated', 65, 55],
    ['Deep Love / Devoted', 80, 80], ['Obsessed / Possessive', 95, 80]
].map(([stage, affinity, trust]) => ({ stage: String(stage), affinity: Number(affinity), trust: Number(trust), label: String(stage) }));
export const RELATIONSHIP_MOODS = ['Calm', 'Warm', 'Flustered', 'Tender / Reconciled', 'Playful / Competitive', 'Possessive', 'Guarded', 'Quarreling / Heated', 'Hurt / Heartbroken', 'Softening / Reconciling', 'Afraid', 'Submissive', 'Hostile', 'Disappointed', 'Thoughtful', 'Joyful', 'Protective', 'Melancholic', 'Stern'];
const aliases = { Acquaintance: 'Acquaintance / Comrade', Allies: 'Acquaintance / Comrade', Confidant: 'Close Friend / Confidant', 'Admiration / Romance': 'Deep Love / Devoted', 'Rivalry / Tense': 'Cold / Guarded', 'Hostile / Adversary': 'Hostile / Bitter', 'Hostile / Rival': 'Hostile / Bitter' };
/** @param {string} stage */
export function normalizeRelationshipStage(stage) {
    return Object.hasOwn(aliases, stage) ? aliases[stage] : (RELATIONSHIP_PRESETS.some(p => p.stage === stage) ? stage : 'Stranger / Neutral');
}

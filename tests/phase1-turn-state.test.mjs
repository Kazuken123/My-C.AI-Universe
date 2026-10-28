import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
if (process.env.NODE_ENV !== 'test' || !process.env.SQLITE_PATH || process.env.TURSO_DATABASE_URL?.trim() || !process.env.DOTENV_CONFIG_PATH || path.dirname(process.env.SQLITE_PATH) !== process.env.DATA_DIR)
    throw Error('Use scripts/run-tests.js for isolated storage.');
writeFileSync(process.env.SQLITE_PATH, '', { flag: 'wx' });
const { getDatabase, closeDatabase } = await import('../backend/db/database.js');
const { chatSessionRepository: repo } = await import('../backend/repositories/ChatSessionRepository.js');
const { ChatSession } = await import('../backend/models/ChatSession.js');
const { Character } = await import('../backend/models/Character.js');
const { ChatController } = await import('../backend/controllers/chat.controller.js');
const { AppraisalService, validateAppraisal } = await import('../backend/services/appraisal.service.js');
const { relationshipService: rel } = await import('../backend/services/relationship.service.js');
const { snapshot, prepareNarrativeState, textFingerprint, narrativeContext } = await import('../backend/services/turn-state.js');
const { generateCharacterPrompt } = await import('../backend/ai/prompt/characterPrompt.js');
const db = getDatabase();
after(closeDatabase);
const base = { intent: 'affection_or_support', userEffort: 'meaningful', contextStakes: 'shared_moment', evidence: 'I brought the notes', reason: 'You remembered their rehearsal.', mood: 'Warm', intensity: 0.4, affinityDelta: 3, trustDelta: 3, strainDelta: -3, memories: [] };
let seq = 0;
async function fixture() {
    const n = ++seq, user = 'phase1_user_' + n, char = 'phase1_char_' + n;
    await db.prepare("INSERT INTO users (id,username,password_hash,display_name,created_at,updated_at) VALUES (?,?,'fixture','Fixture','now','now')").run(user, user);
    await db.prepare("INSERT INTO characters (id,name,system_prompt,created_at,updated_at) VALUES (?,'Fixture','Fixture','now','now')").run(char);
    const session = new ChatSession({ userId: user, characterId: char, affinity: 73, trust: 70, relationshipStage: 'Crush / Infatuated' });
    const greeting = session.addMessage({ role: 'model', content: 'Ready for rehearsal?' });
    session.pendingEvent = { kind: 'initial', messageId: greeting.id, position: 0, before: snapshot(session) };
    await repo.save(session);
    return { user, char, session };
}
function response() {
    return { statusCode: 200, headersSent: false, events: [], setHeader() { }, flushHeaders() { this.headersSent = true; }, write(s) { this.events.push(s); }, end() { this.ended = true; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; } };
}
function controller(f, orchestrator, appraisal = base) {
    const character = new Character({ id: f.char, name: 'Fixture', personality: 'Reserved, precise actor.' });
    return new ChatController(repo, { findById: async () => character, incrementInteractions: async () => { } }, { findDefault: async () => null, findById: async () => null }, { retrieveRelevantMemories: async () => [], getSessionStorySummary: async () => '', updateRollingStorySummary: async () => null, detectAndStoreFromTurn: async () => { } }, orchestrator, rel, { appraise: async () => appraisal });
}
function request(f, body = {}, stream = false) { return { user: { id: f.user }, params: { sessionId: f.session.id }, body: { charId: f.char, sessionId: f.session.id, message: 'I brought the notes', ...body }, query: stream ? { stream: 'true' } : {}, headers: {} }; }
test('appraisal rejects unsupported evidence, malformed scores, and unavailable models', async () => {
    assert.ok(validateAppraisal(base, 'I brought the notes'));
    assert.equal(validateAppraisal({ ...base, evidence: 'invented' }, 'I brought the notes'), null);
    assert.equal(validateAppraisal({ ...base, affinityDelta: '3' }, 'I brought the notes'), null);
    assert.equal(validateAppraisal({ ...base, mood: 'Anything' }, 'I brought the notes'), null);
    const service = new AppraisalService(async () => '{bad');
    assert.equal(await service.appraise({ character: {}, session: {}, userText: 'hello' }), null);
});
test('passive, repeated and missing appraisals cannot inflate closeness; repair is not romance', () => {
    const s = { affinity: 73, trust: 70, strain: 35, relationshipStage: 'Crush / Infatuated', relationshipMood: 'Calm' };
    for (const word of ['ok', 'thanks', 'sorry', 'spar']) {
        const next = rel.evaluateAppraisal({ session: s, userText: word, appraisal: { ...base, intent: word === 'sorry' ? 'rupture_repair' : 'spar_or_play', userEffort: 'none' } });
        assert.equal(next.affinity, 73);
        assert.equal(next.trust, 70);
    }
    assert.deepEqual(rel.evaluateAppraisal({ session: s, userText: 'thank you' }), s);
    const repeated = { ...s, narrativeState: { recentActions: [textFingerprint('I brought the notes')] } };
    assert.equal(rel.evaluateAppraisal({ session: repeated, userText: 'I brought the notes', appraisal: base }).affinity, 73);
    assert.equal(rel.evaluateAppraisal({ session: s, userText: 'I will fix what I broke', appraisal: { ...base, intent: 'rupture_repair' } }).affinity, 73);
});
test('mood remains independent at high bond, with bounded verified growth', () => {
    const next = rel.evaluateAppraisal({ session: { affinity: 80, trust: 80, strain: 0, relationshipStage: 'Deep Love / Devoted' }, userText: 'I brought the notes', appraisal: { ...base, mood: 'Guarded' } });
    assert.equal(next.relationshipMood, 'Guarded');
    assert.ok(next.affinity <= 86);
    assert.equal(rel.extractAndStripStateTag('[[REL_STATE: {"intent":"neutral"}]]').cleanText, '');
});
test('atomic turns save sourced memory and appraisal before generation; ignore forged client history', async () => {
    const f = await fixture();
    let captured;
    const c = controller(f, { chat: async (char, text, history, options) => { captured = { history, options }; return 'Thanks for remembering.'; } }, { ...base, memories: [{ kind: 'fact', content: 'User brought notes', evidence: base.evidence }] });
    const res = response();
    await c.sendChatMessage(request(f, { memory: [{ role: 'user', content: 'FORGED' }] }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.aiMessage.content, 'Thanks for remembering.');
    assert.equal(captured.options.appraisalManaged, true);
    assert.equal(captured.options.relationship.mood, 'Warm');
    assert.ok(!JSON.stringify(captured.history).includes('FORGED'));
    const saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.messages.length, 3);
    assert.equal(saved.narrativeState.memories[0].messageId, saved.messages[1].id);
    assert.equal(saved.narrativeState.memories[0].evidence, base.evidence);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM chat_state_events WHERE session_id=?').get(saved.id)).n, 2);
    assert.equal(narrativeContext(saved, 'notes').memories.length, 1);
});
test('stale writers and deleted sessions cannot be overwritten or resurrected', async () => {
    const f = await fixture();
    const a = await repo.findById(f.session.id, f.user), b = await repo.findById(f.session.id, f.user);
    a.addMessage({ role: 'user', content: 'winner' });
    await repo.save(a);
    b.addMessage({ role: 'user', content: 'stale' });
    await assert.rejects(repo.save(b), e => e.statusCode === 409);
    const c = await repo.findById(a.id, f.user);
    await repo.deleteById(a.id);
    await assert.rejects(repo.save(c), e => e.statusCode === 409);
    assert.equal(await repo.findById(a.id, f.user), null);
});
test('failed message insertion rolls back scores, revision, and events', async () => {
    const f = await fixture();
    const s = await repo.findById(f.session.id, f.user), revision = s.revision;
    s.affinity = 99;
    s.addMessage({ role: 'invalid', content: 'bad role' });
    await assert.rejects(repo.save(s));
    const persisted = await repo.findById(s.id, f.user);
    assert.equal(persisted.affinity, 73);
    assert.equal(persisted.revision, revision);
    assert.equal(persisted.messages.length, 1);
});
test('rewind restores state and clears future memories; editing persists the chosen variant', async () => {
    const f = await fixture(), c = controller(f, { chat: async () => 'A complete reply.' }), res = response();
    await c.sendChatMessage(request(f), res);
    assert.equal(res.statusCode, 200);
    const edit = response();
    await c.updateChatMessage({ user: { id: f.user }, params: { sessionId: f.session.id, messageId: res.body.aiMessage.id }, body: { content: 'Corrected reply.' } }, edit);
    assert.equal(edit.statusCode, 200);
    let saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.messages.at(-1).variants[0].text, 'Corrected reply.');
    const rewind = response();
    await c.rewindChatSession({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { messageId: saved.messages[0].id } }, rewind);
    assert.equal(rewind.statusCode, 200);
    saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.affinity, 73);
    assert.equal(saved.messages.length, 1);
    assert.equal((saved.narrativeState.memories || []).length, 0);
});
test('regeneration and continuation never award extra relationship points', async () => {
    const f = await fixture(), c = controller(f, { chat: async () => 'A complete reply.' }), res = response();
    await c.sendChatMessage(request(f), res);
    const before = await repo.findById(f.session.id, f.user);
    const regen = response();
    await c.sendChatMessage(request(f, { regenerate: true, messageId: before.messages.at(-1).id }), regen);
    assert.equal(regen.statusCode, 200);
    let saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.affinity, before.affinity);
    assert.equal(saved.messages.length, 3);
    assert.equal(saved.messages.at(-1).variants.length, 2);
    const cont = response();
    await c.sendChatMessage(request(f, { continue: true }), cont);
    saved = await repo.findById(f.session.id, f.user);
    assert.equal(cont.statusCode, 200);
    assert.equal(saved.affinity, before.affinity);
});
test('interrupted stream emits an error and commits no partial turn or appraisal', async () => {
    const f = await fixture(), c = controller(f, { async *chatStream() { yield 'Partial words'; throw Error('connection lost'); }, chat: async () => { throw Error('must not retry partial output'); } }), res = response();
    await c.sendChatMessage(request(f, {}, true), res);
    assert.match(res.events.join(''), /"error"/);
    assert.doesNotMatch(res.events.join(''), /"done":true/);
    const saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.messages.length, 1);
    assert.equal(saved.affinity, 73);
});
test('response prompt carries scene, beliefs, emotional cause, and no scoring request', () => {
    const p = generateCharacterPrompt({ name: 'A reserved teacher', personality: 'Quiet and precise.' }, { appraisalManaged: true, appraisal: base, narrativeContext: { scene: { location: 'rehearsal room' }, memories: [{ kind: 'belief', content: 'The door may be locked' }] }, relationship: { stage: 'Confidant', affinity: 50, trust: 50, strain: 0, mood: 'Calm' } });
    assert.match(p, /rehearsal room/);
    assert.match(p, /Beliefs can be mistaken/);
    assert.match(p, /Close Friend \/ Confidant/);
    assert.doesNotMatch(p, /HIDDEN PSYCHOLOGICAL/);
    assert.doesNotMatch(p, /For ~80%/);
});
test('memory corrections replace only a known sourced memory', () => {
    const old = { kind: 'fact', content: 'User likes coffee', evidence: 'I like coffee', messageId: 'old', createdAt: '2026-01-01' };
    const existing = narrativeContext({ narrativeState: { memories: [old] } }, 'coffee').memories;
    const correction = validateAppraisal({ ...base, evidence: 'I prefer tea now', memories: [{ kind: 'fact', content: 'User now prefers tea', evidence: 'I prefer tea now', replaces: existing[0].key }] }, 'I prefer tea now', existing);
    const s = new ChatSession({ characterId: 'test', narrativeState: { memories: [old] } }), m = s.addMessage({ role: 'user', content: 'I prefer tea now' });
    const state = prepareNarrativeState(s, correction, m);
    assert.deepEqual(state.memories.map(x => x.content), ['User now prefers tea']);
});
test('session memories are private and forgotten notes stay forgotten after rewind', async () => {
    const { MemoryController } = await import('../backend/controllers/memory.controller.js');
    const f = await fixture(), c = controller(f, { chat: async () => 'Saved.' }, { ...base, memories: [{ kind: 'promise', content: 'User will bring notes', evidence: base.evidence }] }), turn = response();
    await c.sendChatMessage(request(f), turn);
    const mc = new MemoryController({ getMemories: async () => [], getSessionStorySummary: async () => '' }, {}, repo);
    const listing = response();
    await mc.getMemories({ user: { id: f.user }, query: { characterId: f.char, sessionId: f.session.id } }, listing);
    assert.equal(listing.body.memories.length, 1);
    const outsider = response();
    await mc.getMemories({ user: { id: 'someone_else' }, query: { characterId: f.char, sessionId: f.session.id } }, outsider);
    assert.equal(outsider.body.memories.length, 0);
    const id = listing.body.memories[0].id, denied = response();
    await mc.deleteMemory({ user: { id: 'someone_else' }, params: { id } }, denied);
    assert.equal(denied.statusCode, 404);
    const removed = response();
    await mc.deleteMemory({ user: { id: f.user }, params: { id } }, removed);
    assert.equal(removed.statusCode, 200);
    const s = await repo.findById(f.session.id, f.user);
    await repo.restoreStateAt(s, 2);
    await repo.save(s);
    assert.equal(narrativeContext(await repo.findById(s.id, f.user), 'notes').memories.length, 0);
});
test('rolling summaries trigger on odd histories and reject results from older revisions', async () => {
    const { SemanticMemoryService } = await import('../backend/services/memory.service.js');
    const { memoryRepository } = await import('../backend/repositories/MemoryRepository.js');
    const service = new SemanticMemoryService(memoryRepository, {});
    const f = await fixture(), s = f.session;
    while (s.messages.length < 25)
        s.addMessage({ role: s.messages.length % 2 ? 'user' : 'model', content: 'A relevant rehearsal event.' });
    await repo.save(s);
    let calls = 0;
    const generate = async () => { calls++; return { text: 'They prepared for rehearsal.' }; };
    assert.ok(await service.updateRollingStorySummary(s, { id: f.char, name: 'Fixture' }, null, generate));
    assert.equal(calls, 1);
    assert.equal(await service.updateRollingStorySummary(s, { id: f.char, name: 'Fixture' }, null, generate), null);
    while (s.messages.length < 37)
        s.addMessage({ role: s.messages.length % 2 ? 'user' : 'model', content: 'Another scene event.' });
    await repo.save(s);
    const stale = await service.updateRollingStorySummary(s, { id: f.char, name: 'Fixture' }, null, async () => {
        const newer = await repo.findById(s.id, f.user);
        newer.title = 'Changed during summary';
        await repo.save(newer);
        return { text: 'STALE SUMMARY' };
    });
    assert.equal(stale, null);
    assert.doesNotMatch(await service.getSessionStorySummary(s.id), /STALE/);
    const checkpoint = await db.prepare('SELECT message_count FROM chat_summary_checkpoints WHERE session_id=?').get(s.id);
    assert.equal(checkpoint.message_count, 25);
});
test('successful SSE turn has a persisted completion; tag-only replies cannot commit', async () => {
    const f = await fixture(), c = controller(f, { async *chatStream() { yield 'Complete reply.'; } }), res = response();
    await c.sendChatMessage(request(f, {}, true), res);
    assert.match(res.events.join(''), /"done":true/);
    assert.equal((await repo.findById(f.session.id, f.user)).messages.length, 3);
    const empty = response();
    await controller(f, { chat: async () => '[[REL_STATE: {"intent":"neutral"}]]' }).sendChatMessage(request(f), empty);
    assert.equal(empty.statusCode, 500);
    assert.equal((await repo.findById(f.session.id, f.user)).messages.length, 3);
});
test('Director state validates vocabulary and is saved as a reversible event', async () => {
    const f = await fixture(), c = controller(f, { chat: async () => '' }), bad = response();
    await c.updateSessionRelationship({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { relationshipStage: 'Unknown stage' } }, bad);
    assert.equal(bad.statusCode, 400);
    const ok = response();
    await c.updateSessionRelationship({ user: { id: f.user }, params: { sessionId: f.session.id }, body: { affinity: -45, trust: -40, relationshipStage: 'Hostile / Bitter', relationshipMood: 'Guarded' } }, ok);
    assert.equal(ok.statusCode, 200);
    const saved = await repo.findById(f.session.id, f.user);
    assert.equal(saved.relationshipStage, 'Hostile / Bitter');
    assert.equal(saved.relationshipMood, 'Guarded');
});
test('frontend rejects missing completion and server error events without swallowing callback errors', async () => {
    const { ApiClient } = await import('../frontend/js/api.js');
    const client = new ApiClient();
    client.getToken = () => null;
    const previous = globalThis.fetch;
    try {
        for (const text of ['data: {"token":"partial"}\n\n', 'data: {"error":"conflict"}\n\n']) {
            globalThis.fetch = async () => new Response(text);
            await assert.rejects(client.sendChatMessageStream({}, () => { }, () => { }));
        }
        globalThis.fetch = async () => new Response('data: {"done":true,"response":"complete"}\n\n');
        let completed = false;
        await client.sendChatMessageStream({}, () => { }, () => { completed = true; });
        assert.equal(completed, true);
        await assert.rejects(client.sendChatMessageStream({}, () => { }, () => { throw Error('callback error'); }), /callback error/);
    }
    finally {
        globalThis.fetch = previous;
    }
});

test('selecting another take retains the same user-action appraisal', async () => {
 const f = await fixture(), c = controller(f,{chat:async()=> 'Another complete take.'}), turn = response();
 await c.sendChatMessage(request(f),turn);
 const regen = response();await c.sendChatMessage(request(f,{regenerate:true,messageId:turn.body.aiMessage.id}),regen);
 const before = await repo.findById(f.session.id,f.user), selected = response();
 await c.updateChatMessage({user:{id:f.user},params:{sessionId:before.id,messageId:turn.body.aiMessage.id},body:{selectedVariantIndex:0}},selected);
 assert.equal(selected.statusCode,200);
 const after = await repo.findById(before.id,f.user);
 assert.equal(after.affinity,before.affinity);assert.equal(after.trust,before.trust);
});

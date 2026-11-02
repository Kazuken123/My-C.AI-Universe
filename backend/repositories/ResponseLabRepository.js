import { getDatabase, runTransaction } from '../db/database.js';
import { NotFoundError, ConflictError } from '../ai/errors.js';

const trialFromRow = row => ({ ...JSON.parse(row.payload_json), status: row.status, revision: Number(row.revision) });
export class ResponseLabRepository {
  get db() { return getDatabase(); }
  async create(lab, userId) {
    await this.db.prepare('INSERT INTO response_labs(id,user_id,title,snapshot_json,created_at) VALUES(?,?,?,?,?)')
      .run(lab.id, userId, lab.title, JSON.stringify(lab.snapshot), lab.createdAt);
    return lab;
  }
  async list(userId) {
    return this.db.prepare('SELECT id,title,created_at AS createdAt FROM response_labs WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId);
  }
  async get(id, userId) {
    const row = await this.db.prepare('SELECT * FROM response_labs WHERE id=? AND user_id=?').get(id, userId);
    if (!row) throw new NotFoundError('Lab not found');
    return { id: row.id, title: row.title, snapshot: JSON.parse(row.snapshot_json), createdAt: row.created_at };
  }
  async expire(userId) {
    // An interrupted worker releases its lease without manufacturing failed responses or feedback.
    await this.db.prepare("UPDATE response_lab_trials SET status='interrupted',revision=revision+1 WHERE user_id=? AND status='generating' AND lease_until<?").run(userId, Date.now());
  }
  async trials(labId, userId) {
    await this.get(labId, userId);
    await this.expire(userId);
    const rows = await this.db.prepare('SELECT * FROM response_lab_trials WHERE lab_id=? AND user_id=? ORDER BY created_at DESC LIMIT 100').all(labId, userId);
    return rows.map(trialFromRow);
  }
  async trial(id, userId, db = this.db) {
    const row = await db.prepare('SELECT * FROM response_lab_trials WHERE id=? AND user_id=?').get(id, userId);
    if (!row) throw new NotFoundError('Trial not found');
    return trialFromRow(row);
  }
  async reviewedForPreferences({ userId, characterId, personaId }) {
    if (!userId || !characterId) return [];
    // Project only reviewed writing examples. Full trial payloads contain large prompts,
    // private story inputs and unused candidates that must not become preference evidence.
    const rows = await this.db.prepare(`
      SELECT t.id AS trialId, json_extract(b.value, '$.id') AS batchId,
        json_extract(t.payload_json, '$.contextHash') AS contextHash,
        substr(json_extract(t.payload_json, '$.message'), 1, 600) AS prompt,
        substr(json_extract(t.payload_json, '$.context.setup'), 1, 700) AS setup,
        COALESCE(json_extract(t.payload_json, '$.prepared.aiOptions.relationship.stage'),
          json_extract(t.payload_json, '$.context.state.relationshipStage')) AS stage,
        COALESCE(json_extract(t.payload_json, '$.prepared.aiOptions.relationship.mood'),
          json_extract(t.payload_json, '$.context.state.relationshipMood')) AS mood,
        json_extract(b.value, '$.feedback') AS feedback_json,
        (SELECT json_group_array(json_object(
          'id', json_extract(c.value, '$.id'), 'text', substr(json_extract(c.value, '$.text'), 1, 1200),
          'originalLength', length(json_extract(c.value, '$.text'))))
          FROM json_each(b.value, '$.candidates') c
          WHERE json_extract(c.value, '$.status') = 'complete') AS candidates_json
      FROM response_lab_trials t
      JOIN response_labs l ON l.id = t.lab_id AND l.user_id = t.user_id
      JOIN json_each(t.payload_json, '$.batches') b
      WHERE t.user_id = ? AND l.user_id = ?
        AND json_extract(t.payload_json, '$.context.character.id') = ?
        AND COALESCE(json_extract(t.payload_json, '$.context.persona.id'), '') = ?
        AND json_type(b.value, '$.feedback') = 'object'
      ORDER BY json_extract(b.value, '$.feedback.reviewedAt') DESC, t.created_at DESC, CAST(b.key AS INTEGER) DESC
      LIMIT 60
    `).all(userId, userId, characterId, personaId || '');
    return rows.flatMap(({ feedback_json, candidates_json, ...row }) => {
      try { return [{ ...row, feedback: JSON.parse(feedback_json), candidates: JSON.parse(candidates_json) }]; }
      catch { return []; }
    });
  }
  async reviewsForTournament({ userId, contextHash }) {
    if (!userId || !contextHash) return [];
    // Exact frozen-context matches only; an objection in another relationship or
    // scene is not a veto here. Exclude large generation prompts from this read.
    const rows = await this.db.prepare(`
      SELECT t.id AS trialId, json_extract(b.value, '$.id') AS id,
        json_extract(b.value, '$.feedback') AS feedback_json,
        (SELECT json_group_array(json_object(
          'id', json_extract(c.value, '$.id'), 'text', json_extract(c.value, '$.text'),
          'move', json_extract(c.value, '$.move'), 'status', 'complete'))
          FROM json_each(b.value, '$.candidates') c
          WHERE json_extract(c.value, '$.status') = 'complete') AS candidates_json
      FROM response_lab_trials t
      JOIN response_labs l ON l.id = t.lab_id AND l.user_id = t.user_id
      JOIN json_each(t.payload_json, '$.batches') b
      WHERE t.user_id = ? AND l.user_id = ?
        AND json_extract(t.payload_json, '$.contextHash') = ?
        AND json_type(b.value, '$.feedback') = 'object'
      ORDER BY json_extract(b.value, '$.feedback.reviewedAt') DESC, t.created_at DESC, CAST(b.key AS INTEGER) DESC
    `).all(userId, userId, contextHash);
    return rows.flatMap(({ feedback_json, candidates_json, ...row }) => {
      try { return [{ ...row, feedback: JSON.parse(feedback_json), candidates: JSON.parse(candidates_json) }]; }
      catch { return []; }
    });
  }
  async createTrial(trial, userId) {
    await this.get(trial.labId, userId);
    await this.db.prepare('INSERT INTO response_lab_trials(id,lab_id,user_id,payload_json,status,created_at) VALUES(?,?,?,?,?,?)')
      .run(trial.id, trial.labId, userId, JSON.stringify(trial), 'ready', trial.createdAt);
    return this.trial(trial.id, userId);
  }
  async mutate(id, userId, revision, change) {
    return runTransaction(async db => {
      const trial = await this.trial(id, userId, db);
      if (trial.revision !== revision) throw new ConflictError('This trial changed. Reload before trying again.');
      await change(trial);
      trial.revision++;
      try {
        await db.prepare('UPDATE response_lab_trials SET payload_json=?,status=?,revision=?,lease_until=? WHERE id=? AND user_id=?')
          .run(JSON.stringify(trial), trial.status, trial.revision, trial.status === 'generating' ? Date.now() + 600000 : 0, id, userId);
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) throw new ConflictError('A batch is already generating. Wait for it to finish.');
        throw error;
      }
      return trial;
    });
  }
  async remove(id, userId) {
    await this.get(id, userId);
    await this.expire(userId);
    return runTransaction(async db => {
      const active = await db.prepare("SELECT id FROM response_lab_trials WHERE lab_id=? AND user_id=? AND status='generating'").get(id, userId);
      if (active) throw new ConflictError('Wait for generation to finish before deleting this lab.');
      await db.prepare('DELETE FROM response_lab_trials WHERE lab_id=? AND user_id=?').run(id, userId);
      await db.prepare('DELETE FROM response_labs WHERE id=? AND user_id=?').run(id, userId);
    });
  }
}
export const responseLabRepository = new ResponseLabRepository();

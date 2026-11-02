export async function applyResponseLabMigration(raw) {
  await raw.executeMultiple(`
    CREATE TABLE IF NOT EXISTS response_labs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS response_labs_owner ON response_labs(user_id, created_at);
    CREATE TABLE IF NOT EXISTS response_lab_trials (
      id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES response_labs(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS response_lab_trials_owner ON response_lab_trials(lab_id,user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS response_lab_one_job ON response_lab_trials(user_id) WHERE status = 'generating';
  `);
}

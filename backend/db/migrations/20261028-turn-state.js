export async function applyTurnStateMigration(raw) {
    const tx = await raw.transaction('write');
    try {
        const cols = new Set((await tx.execute('PRAGMA table_info(chat_sessions)')).rows.map(r => r.name));
        if (!cols.has('revision'))
            await tx.execute('ALTER TABLE chat_sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
        if (!cols.has('narrative_state'))
            await tx.execute("ALTER TABLE chat_sessions ADD COLUMN narrative_state TEXT NOT NULL DEFAULT '{}'");
        await tx.execute("CREATE TABLE IF NOT EXISTS chat_state_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE, message_id TEXT REFERENCES chat_messages(id) ON DELETE CASCADE, position INTEGER NOT NULL, kind TEXT NOT NULL, before_state TEXT NOT NULL, after_state TEXT NOT NULL, created_at TEXT NOT NULL)");
        await tx.execute('CREATE INDEX IF NOT EXISTS idx_chat_state_events_session ON chat_state_events(session_id, position)');
        await tx.execute('CREATE TABLE IF NOT EXISTS chat_summary_checkpoints (session_id TEXT PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE, message_count INTEGER NOT NULL, revision INTEGER NOT NULL)');
        await tx.commit();
    }
    catch (e) {
        await tx.rollback();
        throw e;
    }
}

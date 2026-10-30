/**
 * Character Voice Migration (2026-10-30)
 * Adds voice configuration to characters and per-session voice overrides to chat_sessions.
 */
export async function applyCharacterVoiceMigration(raw) {
  if (!raw) return;

  const tx = await raw.transaction('write');
  try {
    // 1. Migrate characters table
    const charColsRes = await tx.execute('PRAGMA table_info(characters)');
    const charCols = new Set((charColsRes.rows || []).map(r => r.name));

    if (!charCols.has('voice_provider')) {
      await tx.execute("ALTER TABLE characters ADD COLUMN voice_provider TEXT NOT NULL DEFAULT 'fish_audio'");
    }
    if (!charCols.has('voice_id')) {
      await tx.execute("ALTER TABLE characters ADD COLUMN voice_id TEXT NOT NULL DEFAULT ''");
    }
    if (!charCols.has('voice_name')) {
      await tx.execute("ALTER TABLE characters ADD COLUMN voice_name TEXT NOT NULL DEFAULT ''");
    }

    // 2. Migrate chat_sessions table
    const sessionColsRes = await tx.execute('PRAGMA table_info(chat_sessions)');
    const sessionCols = new Set((sessionColsRes.rows || []).map(r => r.name));

    if (!sessionCols.has('voice_id_override')) {
      await tx.execute("ALTER TABLE chat_sessions ADD COLUMN voice_id_override TEXT NOT NULL DEFAULT ''");
    }
    if (!sessionCols.has('voice_name_override')) {
      await tx.execute("ALTER TABLE chat_sessions ADD COLUMN voice_name_override TEXT NOT NULL DEFAULT ''");
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

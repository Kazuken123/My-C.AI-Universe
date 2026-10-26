// Immutable recognition tuples for public lore shipped in seed.sql before visibility existed.
// An ID or a source label alone does not prove that legacy content was public.
const PUBLIC_SEED_LORE = [
  ['mem_gojo_1', '1766160797313', 'Satoru Gojo loves sweet foods, especially Kikufuku mochi with edamame and whipped cream from Sendai.'],
  ['mem_kana_1', '1766394139616', 'Kana Arima is 17 years old, the center of the idol group B-Komachi, and a former child prodigy actress.'],
  ['mem_frieren_1', '1767000000001', 'Frieren traveled for ten years with the Hero Himmel, the Priest Heiter, and the Warrior Eisen to defeat the Demon King.'],
  ['mem_goku_1', '1767000000003', 'Goku is married to Chi-Chi, loves eating enormous amounts of meat, and uses Instant Transmission to travel instantly.']
];

const VERSION = '20261027-memory-privacy';

/**
 * Add explicit visibility without deleting ambiguous legacy NULL-session records.
 * All schema/backfill/trigger changes commit together, or roll back for a safe retry.
 */
export async function applyMemoryPrivacyMigration(client) {
  const tx = await client.transaction('write');
  try {
    const columns = await tx.execute('PRAGMA table_info(character_memories)');
    if (!columns.rows.some(column => column.name === 'visibility')) {
      await tx.execute(`ALTER TABLE character_memories ADD COLUMN visibility TEXT NOT NULL
        DEFAULT 'quarantined' CHECK (visibility IN ('global', 'session', 'quarantined'))`);
    }
    await tx.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TEXT NOT NULL
    )`);
    const applied = await tx.execute({ sql: 'SELECT name FROM schema_migrations WHERE name = ?', args: [VERSION] });
    if (applied.rows.length === 0) {
      await tx.execute(`UPDATE character_memories SET visibility = 'session'
        WHERE visibility = 'quarantined' AND session_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM chat_sessions s
          JOIN users u ON u.id = s.user_id JOIN characters c ON c.id = s.character_id
          WHERE s.id = character_memories.session_id AND s.character_id = character_memories.character_id
        )`);
      for (const [id, characterId, content] of PUBLIC_SEED_LORE) {
        await tx.execute({
          sql: `UPDATE character_memories SET visibility = 'global'
            WHERE visibility = 'quarantined' AND session_id IS NULL
              AND id = ? AND character_id = ? AND content = ? AND source = 'wiki'`,
          args: [id, characterId, content]
        });
      }
      await tx.execute({ sql: 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', args: [VERSION, new Date().toISOString()] });
    }

    // Delete attached facts before SET NULL can run, including cascades from account deletion.
    await tx.execute(`CREATE TRIGGER IF NOT EXISTS memory_privacy_delete_session
      BEFORE DELETE ON chat_sessions BEGIN
        DELETE FROM character_memories WHERE session_id = OLD.id;
      END`);
    // Some legacy databases lack the newer parent FKs. Do not depend on their cascades.
    await tx.execute(`CREATE TRIGGER IF NOT EXISTS memory_privacy_delete_user
      BEFORE DELETE ON users BEGIN
        DELETE FROM character_memories WHERE session_id IN (
          SELECT id FROM chat_sessions WHERE user_id = OLD.id
        );
      END`);
    await tx.execute(`CREATE TRIGGER IF NOT EXISTS memory_privacy_delete_character
      BEFORE DELETE ON characters BEGIN
        DELETE FROM character_memories WHERE character_id = OLD.id;
      END`);
    // Enforce scope even for background extraction finishing after a session/character was deleted.
    const invalidScope = `(NEW.visibility = 'global' AND NEW.session_id IS NOT NULL) OR
      (NEW.visibility = 'session' AND (NEW.session_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM chat_sessions s
        JOIN users u ON u.id = s.user_id JOIN characters c ON c.id = s.character_id
        WHERE s.id = NEW.session_id AND s.character_id = NEW.character_id
      )))`;
    await tx.execute(`CREATE TRIGGER IF NOT EXISTS memory_privacy_insert
      BEFORE INSERT ON character_memories WHEN ${invalidScope}
      BEGIN SELECT RAISE(ABORT, 'Invalid private memory scope'); END`);
    await tx.execute(`CREATE TRIGGER IF NOT EXISTS memory_privacy_update
      BEFORE UPDATE OF session_id, character_id, visibility ON character_memories WHEN ${invalidScope}
      BEGIN SELECT RAISE(ABORT, 'Invalid private memory scope'); END`);
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

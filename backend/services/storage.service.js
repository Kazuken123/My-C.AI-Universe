import { getDatabase, runTransaction } from '../db/database.js';

/**
 * Map a SQL row from `characters` table to application domain object
 */
function mapCharacterRow(row) {
  if (!row) return null;
  let categories = ['Roleplay'];
  try {
    categories = JSON.parse(row.categories_json || '["Roleplay"]');
  } catch {
    categories = ['Roleplay'];
  }

  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline || '',
    avatar: row.avatar || '',
    greeting: row.greeting || '',
    personality: row.personality || '',
    appearance: row.appearance || '',
    abilities: row.abilities || '',
    background: row.background || '',
    speaking_style: row.speaking_style || '',
    example_dialogues: row.example_dialogues || '',
    initial_memory: row.initial_memory || '',
    systemPrompt: row.system_prompt || '',
    wiki: row.wiki || '',
    wikiUrl: row.wiki_url || row.wiki || '',
    categories,
    creator: row.creator || '@you',
    interactions: Number(row.interactions) || 0,
    likes: Number(row.likes) || 0,
    isLiked: Boolean(row.is_liked),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map a SQL row from `user_personas` table to application domain object
 */
function mapPersonaRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar || '🌟',
    description: row.description || '',
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Map a SQL row from `character_memories` table to application domain object
 */
function mapMemoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    characterId: row.character_id,
    sessionId: row.session_id || null,
    content: row.content,
    source: row.source || 'conversation',
    createdAt: row.created_at
  };
}

/**
 * Relational SQL Repository Service (backed by universe.sqlite & schema.sql)
 */
export const storage = {
  /**
   * Read all characters from SQL `characters` table
   */
  getCharacters() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM characters ORDER BY created_at DESC').all();
    return rows.map(mapCharacterRow);
  },

  /**
   * Persist characters collection into SQL `characters` table within a transaction
   */
  saveCharacters(chars) {
    runTransaction((db) => {
      const keepIds = chars.map(c => c.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM characters').run();
        return;
      }

      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM characters WHERE id NOT IN (${placeholders})`).run(...keepIds);

      const upsertStmt = db.prepare(`
        INSERT INTO characters (
          id, name, tagline, avatar, greeting, personality, appearance, abilities,
          background, speaking_style, example_dialogues, initial_memory, system_prompt,
          wiki, wiki_url, categories_json, creator, interactions, likes, is_liked,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          tagline = excluded.tagline,
          avatar = excluded.avatar,
          greeting = excluded.greeting,
          personality = excluded.personality,
          appearance = excluded.appearance,
          abilities = excluded.abilities,
          background = excluded.background,
          speaking_style = excluded.speaking_style,
          example_dialogues = excluded.example_dialogues,
          initial_memory = excluded.initial_memory,
          system_prompt = excluded.system_prompt,
          wiki = excluded.wiki,
          wiki_url = excluded.wiki_url,
          categories_json = excluded.categories_json,
          creator = excluded.creator,
          interactions = excluded.interactions,
          likes = excluded.likes,
          is_liked = excluded.is_liked,
          updated_at = excluded.updated_at
      `);

      const now = new Date().toISOString();
      for (const c of chars) {
        upsertStmt.run(
          c.id,
          c.name || 'Unnamed Character',
          c.tagline || '',
          c.avatar || '',
          c.greeting || '',
          c.personality || '',
          c.appearance || '',
          c.abilities || '',
          c.background || '',
          c.speaking_style || '',
          c.example_dialogues || '',
          c.initial_memory || '',
          c.systemPrompt || '',
          c.wiki || '',
          c.wikiUrl || c.wiki || '',
          JSON.stringify(Array.isArray(c.categories) ? c.categories : ['Roleplay']),
          c.creator || '@you',
          Number(c.interactions) || 0,
          Number(c.likes) || 0,
          c.isLiked ? 1 : 0,
          c.createdAt || now,
          c.updatedAt || now
        );
      }
    });
  },

  /**
   * Read all chat sessions joined with their `chat_messages` and `message_variants` from SQL
   */
  getChats() {
    const db = getDatabase();
    const sessions = db.prepare('SELECT * FROM chat_sessions ORDER BY updated_at DESC').all();
    const messagesStmt = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY position ASC, created_at ASC');
    const variantsStmt = db.prepare('SELECT * FROM message_variants WHERE message_id = ? ORDER BY variant_index ASC');

    return sessions.map(s => {
      const msgRows = messagesStmt.all(s.id);
      const messages = msgRows.map(m => {
        const varRows = variantsStmt.all(m.id);
        const variants = varRows.length > 0
          ? varRows.map(v => ({
              id: v.id,
              text: v.text,
              createdAt: v.created_at
            }))
          : [{ id: `${m.id}_v1`, text: m.content, createdAt: m.created_at }];

        return {
          id: m.id,
          role: m.role,
          content: m.content,
          selectedVariantIndex: Number(m.selected_variant_index) || 0,
          isPinned: Boolean(m.is_pinned),
          rating: Number(m.rating) || 0,
          createdAt: m.created_at,
          variants
        };
      });

      return {
        id: s.id,
        characterId: s.character_id,
        personaId: s.persona_id || 'persona_default',
        title: s.title,
        provider: s.provider || 'gemini',
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        messages
      };
    });
  },

  /**
   * Persist chat sessions, messages, and swipe variants across normalized SQL tables
   */
  saveChats(chats) {
    runTransaction((db) => {
      const keepSessionIds = chats.map(c => c.id);
      if (keepSessionIds.length === 0) {
        db.prepare('DELETE FROM chat_sessions').run();
        return;
      }

      const placeholders = keepSessionIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM chat_sessions WHERE id NOT IN (${placeholders})`).run(...keepSessionIds);

      const upsertSessionStmt = db.prepare(`
        INSERT INTO chat_sessions (id, character_id, persona_id, title, provider, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          persona_id = excluded.persona_id,
          title = excluded.title,
          provider = excluded.provider,
          updated_at = excluded.updated_at
      `);

      const deleteMsgsForSessionStmt = db.prepare('DELETE FROM chat_messages WHERE session_id = ?');
      const insertMsgStmt = db.prepare(`
        INSERT INTO chat_messages (
          id, session_id, role, content, selected_variant_index, is_pinned, rating, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertVariantStmt = db.prepare(`
        INSERT INTO message_variants (id, message_id, variant_index, text, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();

      for (const s of chats) {
        upsertSessionStmt.run(
          s.id,
          s.characterId,
          s.personaId || null,
          s.title || 'Chat',
          s.provider || 'gemini',
          s.createdAt || now,
          s.updatedAt || now
        );

        // Replace messages & variants for session
        deleteMsgsForSessionStmt.run(s.id);

        const msgs = Array.isArray(s.messages) ? s.messages : [];
        msgs.forEach((m, posIdx) => {
          insertMsgStmt.run(
            m.id,
            s.id,
            m.role || 'model',
            m.content || '',
            Number(m.selectedVariantIndex) || 0,
            m.isPinned ? 1 : 0,
            Number(m.rating) || 0,
            posIdx,
            m.createdAt || now
          );

          const variants = Array.isArray(m.variants) && m.variants.length > 0
            ? m.variants
            : [{ id: `${m.id}_v1`, text: m.content || '', createdAt: m.createdAt || now }];

          variants.forEach((v, varIdx) => {
            insertVariantStmt.run(
              v.id || `${m.id}_v${varIdx + 1}`,
              m.id,
              varIdx,
              v.text || m.content || '',
              v.createdAt || m.createdAt || now
            );
          });
        });
      }
    });
  },

  /**
   * Read all user personas from SQL `user_personas` table
   */
  getPersonas() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM user_personas ORDER BY is_default DESC, created_at ASC').all();
    return rows.map(mapPersonaRow);
  },

  /**
   * Persist user personas into SQL `user_personas` table
   */
  savePersonas(personas) {
    runTransaction((db) => {
      const keepIds = personas.map(p => p.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM user_personas').run();
        return;
      }

      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM user_personas WHERE id NOT IN (${placeholders})`).run(...keepIds);

      const upsertStmt = db.prepare(`
        INSERT INTO user_personas (id, name, avatar, description, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          avatar = excluded.avatar,
          description = excluded.description,
          is_default = excluded.is_default,
          updated_at = excluded.updated_at
      `);

      const now = new Date().toISOString();
      for (const p of personas) {
        upsertStmt.run(
          p.id,
          p.name,
          p.avatar || '🌟',
          p.description || '',
          p.isDefault ? 1 : 0,
          p.createdAt || now,
          p.updatedAt || now
        );
      }
    });
  },

  /**
   * Read all character memories from SQL `character_memories` table
   */
  getMemories() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM character_memories ORDER BY created_at ASC').all();
    return rows.map(mapMemoryRow);
  },

  /**
   * Persist character memories into SQL `character_memories` table
   */
  saveMemories(memories) {
    runTransaction((db) => {
      const keepIds = memories.map(m => m.id);
      if (keepIds.length === 0) {
        db.prepare('DELETE FROM character_memories').run();
        return;
      }

      const placeholders = keepIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM character_memories WHERE id NOT IN (${placeholders})`).run(...keepIds);

      const upsertStmt = db.prepare(`
        INSERT INTO character_memories (id, character_id, session_id, content, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content = excluded.content,
          source = excluded.source
      `);

      const now = new Date().toISOString();
      for (const m of memories) {
        upsertStmt.run(
          m.id,
          m.characterId,
          m.sessionId || null,
          m.content,
          m.source || 'conversation',
          m.createdAt || now
        );
      }
    });
  },

  /**
   * Return relational SQL table counts for health diagnostics
   */
  getSqlStats() {
    const db = getDatabase();
    return {
      engine: 'SQLite (node:sqlite Relational SQL)',
      tables: {
        characters: db.prepare('SELECT COUNT(*) AS c FROM characters').get().c,
        chat_sessions: db.prepare('SELECT COUNT(*) AS c FROM chat_sessions').get().c,
        chat_messages: db.prepare('SELECT COUNT(*) AS c FROM chat_messages').get().c,
        message_variants: db.prepare('SELECT COUNT(*) AS c FROM message_variants').get().c,
        user_personas: db.prepare('SELECT COUNT(*) AS c FROM user_personas').get().c,
        character_memories: db.prepare('SELECT COUNT(*) AS c FROM character_memories').get().c
      }
    };
  }
};

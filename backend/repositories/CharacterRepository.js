import { BaseRepository } from './BaseRepository.js';
import { Character } from '../models/Character.js';

/**
 * CharacterRepository Class
 * Manages relational SQL persistence for Character domain entities.
 */
export class CharacterRepository extends BaseRepository {
  constructor() {
    super('characters');
  }

  /**
   * Find all characters as Character model instances
   * @param {Object} [targetDb]
   * @returns {Promise<Character[]>}
   */
  async findAll(targetDb = null) {
    const conn = targetDb || this.db;
    const rows = await conn.prepare('SELECT * FROM characters ORDER BY created_at DESC').all();
    return rows.map(row => Character.fromDatabaseRow(row));
  }

  /**
   * Find characters with search, category filter, and sorting
   * @param {Object} [options]
   * @returns {Promise<Character[]>}
   */
  async findAllFiltered({ search = '', category = 'All', sort = 'popular' } = {}) {
    const allChars = await this.findAll();
    let chars = allChars.filter(c => c && c.name && c.name.trim().length > 0);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      chars = chars.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.tagline && c.tagline.toLowerCase().includes(q)) ||
        (c.personality && c.personality.toLowerCase().includes(q)) ||
        (Array.isArray(c.categories) && c.categories.some(cat => cat.toLowerCase().includes(q)))
      );
    }

    if (category && category !== 'All') {
      const catLower = category.toLowerCase();
      chars = chars.filter(c =>
        Array.isArray(c.categories) && c.categories.some(cat => cat.toLowerCase() === catLower)
      );
    }

    if (sort === 'popular') {
      chars.sort((a, b) => (b.interactions || 0) - (a.interactions || 0));
    } else if (sort === 'likes') {
      chars.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else if (sort === 'name') {
      chars.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'newest') {
      chars.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return chars;
  }

  /**
   * Find a single character by ID
   * @param {string} id
   * @param {Object} [targetDb]
   * @returns {Promise<Character|null>}
   */
  async findById(id, targetDb = null) {
    const conn = targetDb || this.db;
    const row = await conn.prepare('SELECT * FROM characters WHERE id = ?').get(id);
    return Character.fromDatabaseRow(row);
  }

  /**
   * Insert or update a single Character entity in SQL
   * @param {Character|Object} charObj
   * @param {Object} [targetDb]
   * @returns {Promise<Character>}
   */
  async save(charObj, targetDb = null) {
    const conn = targetDb || this.db;
    const char = charObj instanceof Character ? charObj : new Character(charObj);
    char.validate();

    const stmt = conn.prepare(`
      INSERT INTO characters (
        id, name, tagline, avatar, greeting, personality, appearance, abilities,
        background, speaking_style, example_dialogues, initial_memory, system_prompt,
        wiki, wiki_url, categories_json, creator, owner_user_id, interactions, likes, is_liked,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        owner_user_id = COALESCE(characters.owner_user_id, excluded.owner_user_id),
        interactions = excluded.interactions,
        likes = excluded.likes,
        is_liked = excluded.is_liked,
        updated_at = excluded.updated_at
    `);

    await stmt.run(
      char.id,
      char.name,
      char.tagline,
      char.avatar,
      char.greeting,
      char.personality,
      char.appearance,
      char.abilities,
      char.background,
      char.speaking_style,
      char.example_dialogues,
      char.initial_memory,
      char.systemPrompt,
      char.wiki,
      char.wikiUrl,
      JSON.stringify(char.categories),
      char.creator,
      char.ownerUserId || null,
      char.interactions,
      char.likes,
      char.isLiked ? 1 : 0,
      char.createdAt,
      char.updatedAt
    );

    return char;
  }

  /**
   * O(1) Atomic interaction counter increment without rewriting full character row
   * @param {string} id
   * @param {string} [updatedAt]
   */
  async incrementInteractions(id, updatedAt = new Date().toISOString(), targetDb = null) {
    if (!id) return false;
    const conn = targetDb || this.db;
    const res = await conn.prepare(`
      UPDATE characters
      SET interactions = COALESCE(interactions, 0) + 1,
          updated_at = ?
      WHERE id = ?
    `).run(updatedAt, id);
    return res.changes > 0;
  }

  /**
   * Bulk synchronize character collection inside a transaction
   * @param {Character[]} chars
   */
  async saveAll(chars) {
    return await this.runInTransaction(async (db) => {
      const keepIds = chars.map(c => c.id);
      if (keepIds.length === 0) {
        await db.prepare('DELETE FROM characters').run();
        return;
      }
      const placeholders = keepIds.map(() => '?').join(',');
      await db.prepare(`DELETE FROM characters WHERE id NOT IN (${placeholders})`).run(...keepIds);
      for (const c of chars) {
        await this.save(c, db);
      }
    });
  }
}

export const characterRepository = new CharacterRepository();

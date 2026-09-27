import { parseWiki } from '../services/wiki.service.js';
import { storage } from '../services/storage.service.js';
import { memoryService } from '../services/memory.service.js';
import { compileCharacterSystemPrompt, generateDefaultGreeting } from '../ai/prompt/characterPrompt.js';
import { generateCharacterFromConcept } from '../ai/providers/index.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * Generate a deterministic avatar URL when none is provided
 */
function getDefaultAvatar(name) {
  const seed = encodeURIComponent((name || 'Character').replace(/\s+/g, ''));
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

/**
 * Create a new character
 */
export async function createCharacter(req, res) {
  try {
    const {
      name,
      tagline,
      avatar,
      greeting,
      personality,
      appearance,
      abilities,
      background,
      speaking_style,
      example_dialogues,
      initial_memory,
      categories,
      wiki
    } = req.body;

    if ((!name || typeof name !== 'string' || name.trim().length === 0) && !wiki) {
      throw new ValidationError('Character name or Wiki URL is required', 'name');
    }

    if (name && name.length > 100) {
      throw new ValidationError('Character name too long (max 100 characters)', 'name');
    }

    if (personality && personality.length > 5000) {
      throw new ValidationError('Personality description too long (max 5000 characters)', 'personality');
    }

    let wikiData = {};
    if (wiki && wiki.trim()) {
      console.log('[CHARACTER] Parsing wiki for character creation:', wiki);
      wikiData = await parseWiki(wiki.trim());
    }

    const finalName = (name && name.trim()) || wikiData.name || 'Unnamed Character';
    const now = new Date().toISOString();

    const profile = {
      id: Date.now().toString(),
      name: finalName,
      tagline: (tagline && tagline.trim()) || wikiData.tagline || 'AI Roleplay Character',
      avatar: (avatar && avatar.trim()) || wikiData.avatar || getDefaultAvatar(finalName),
      greeting: (greeting && greeting.trim()) || wikiData.greeting || '',
      personality: (personality && personality.trim()) || wikiData.personality || '',
      appearance: (appearance && appearance.trim()) || wikiData.appearance || '',
      abilities: (abilities && abilities.trim()) || wikiData.abilities || '',
      background: (background && background.trim()) || wikiData.background || '',
      speaking_style: (speaking_style && speaking_style.trim()) || wikiData.speaking_style || '',
      example_dialogues: (example_dialogues && example_dialogues.trim()) || '',
      initial_memory: (initial_memory && initial_memory.trim()) || wikiData.initial_memory || '',
      wiki: (wiki && wiki.trim()) || '',
      wikiUrl: wikiData.wikiUrl || (wiki && wiki.trim()) || '',
      categories: Array.isArray(categories) && categories.length > 0
        ? categories
        : (Array.isArray(wikiData.categories) && wikiData.categories.length > 0 ? wikiData.categories : ['Roleplay', 'Original']),
      creator: '@you',
      interactions: 0,
      likes: 1,
      isLiked: false,
      systemPrompt: '',
      createdAt: now,
      updatedAt: now
    };

    profile.greeting = generateDefaultGreeting(profile);
    profile.systemPrompt = compileCharacterSystemPrompt(profile);

    const characters = storage.getCharacters();
    characters.unshift(profile);
    storage.saveCharacters(characters);

    // Seed initial memory if present
    if (profile.initial_memory) {
      await memoryService.addMemory(profile.initial_memory, profile.id, 'wiki');
    }

    res.status(201).json(profile);
  } catch (error) {
    console.error('[CHARACTER] Error creating character:', error);
    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: { message: error.message, field: error.field, code: 400 }
      });
    }
    const statusCode = error.code || 500;
    res.status(statusCode).json({
      error: { message: error.message || 'Failed to create character', code: statusCode }
    });
  }
}

/**
 * Get all characters with optional search, category filter, and sorting
 */
export function getCharacters(req, res) {
  try {
    const { search, category, sort } = req.query;
    let chars = storage.getCharacters().filter(c => c && c.name && c.name.trim().length > 0);

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
      chars.sort((a, b) => new Date(b.createdAt || Number(b.id) || 0) - new Date(a.createdAt || Number(a.id) || 0));
    }

    res.json(chars);
  } catch (error) {
    console.error('[CHARACTER] Error loading characters:', error);
    res.status(500).json({
      error: { message: 'Failed to load characters', code: 500 }
    });
  }
}

/**
 * Get a specific character by ID
 */
export function getCharacter(req, res) {
  try {
    const { id } = req.params;
    const chars = storage.getCharacters();
    const character = chars.find(x => x.id === id);

    if (!character) {
      throw new NotFoundError('Character not found');
    }

    res.json(character);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to load character', code }
    });
  }
}

/**
 * Update an existing character by ID
 */
export function updateCharacter(req, res) {
  try {
    const { id } = req.params;
    const chars = storage.getCharacters();
    const idx = chars.findIndex(x => x.id === id);

    if (idx === -1) {
      throw new NotFoundError('Character not found');
    }

    const existing = chars[idx];
    const updatableFields = [
      'name', 'tagline', 'avatar', 'greeting', 'personality',
      'appearance', 'abilities', 'background', 'speaking_style',
      'example_dialogues', 'initial_memory', 'wiki', 'categories'
    ];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        existing[field] = req.body[field];
      }
    }

    if (!existing.name || !existing.name.trim()) {
      throw new ValidationError('Character name cannot be empty', 'name');
    }

    existing.greeting = generateDefaultGreeting(existing);
    existing.systemPrompt = compileCharacterSystemPrompt(existing);
    existing.updatedAt = new Date().toISOString();

    chars[idx] = existing;
    storage.saveCharacters(chars);

    res.json(existing);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to update character', code }
    });
  }
}

/**
 * Delete a character and its associated chats & memories
 */
export function deleteCharacter(req, res) {
  try {
    const { id } = req.params;
    const chars = storage.getCharacters();
    const filtered = chars.filter(x => x.id !== id);

    if (filtered.length === chars.length) {
      throw new NotFoundError('Character not found');
    }

    storage.saveCharacters(filtered);

    // Clean up chats and memories for this character
    const chats = storage.getChats().filter(c => c.characterId !== id);
    storage.saveChats(chats);

    const memories = storage.getMemories().filter(m => m.characterId !== id);
    storage.saveMemories(memories);

    res.json({ success: true, deletedId: id });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to delete character', code }
    });
  }
}

/**
 * Toggle like on a character
 */
export function toggleLikeCharacter(req, res) {
  try {
    const { id } = req.params;
    const chars = storage.getCharacters();
    const character = chars.find(x => x.id === id);

    if (!character) {
      throw new NotFoundError('Character not found');
    }

    character.isLiked = !character.isLiked;
    character.likes = Math.max(0, (character.likes || 0) + (character.isLiked ? 1 : -1));
    storage.saveCharacters(chars);

    res.json({ id: character.id, likes: character.likes, isLiked: character.isLiked });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to like character', code }
    });
  }
}

/**
 * Preview Wiki extraction without immediately saving
 */
export async function parseWikiPreview(req, res) {
  try {
    const { url } = req.body;
    if (!url) {
      throw new ValidationError('Wiki URL is required', 'url');
    }
    const extracted = await parseWiki(url);
    res.json(extracted);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to parse Wiki URL', code }
    });
  }
}

/**
 * Generate character profile from short concept using AI
 */
export async function generateCharacterAI(req, res) {
  try {
    const { concept } = req.body;
    if (!concept || typeof concept !== 'string' || concept.trim().length < 3) {
      throw new ValidationError('Please provide a character concept (at least 3 characters)', 'concept');
    }
    const generated = await generateCharacterFromConcept(concept.trim());
    generated.avatar = getDefaultAvatar(generated.name || concept);
    res.json(generated);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to generate character with AI', code }
    });
  }
}

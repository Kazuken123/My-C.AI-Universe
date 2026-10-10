import { BaseController } from './BaseController.js';
import { Character } from '../models/Character.js';
import { characterRepository } from '../repositories/index.js';
import { wikiScraperService } from '../services/wiki.service.js';
import { memoryService } from '../services/memory.service.js';
import { geminiProvider } from '../ai/providers/index.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * CharacterController Class (extends BaseController)
 * Handles HTTP requests for Character CRUD, Likes, Wiki Extraction, and AI Character Generation.
 */
export class CharacterController extends BaseController {
  constructor(
    repository = characterRepository,
    wikiService = wikiScraperService,
    memService = memoryService,
    aiGenerator = geminiProvider
  ) {
    super();
    this.repository = repository;
    this.wikiService = wikiService;
    this.memoryService = memService;
    this.aiGenerator = aiGenerator;

    // Bind route handlers to instance
    this.createCharacter = this.createCharacter.bind(this);
    this.getCharacters = this.getCharacters.bind(this);
    this.getCharacter = this.getCharacter.bind(this);
    this.updateCharacter = this.updateCharacter.bind(this);
    this.deleteCharacter = this.deleteCharacter.bind(this);
    this.toggleLikeCharacter = this.toggleLikeCharacter.bind(this);
    this.parseWikiPreview = this.parseWikiPreview.bind(this);
    this.generateCharacterAI = this.generateCharacterAI.bind(this);
  }

  async createCharacter(req, res) {
    try {
      const { name, wiki } = req.body;
      if ((!name || typeof name !== 'string' || !name.trim()) && !wiki) {
        throw new ValidationError('Character name or Wiki URL is required', 'name');
      }

      let wikiData = {};
      if (wiki && wiki.trim()) {
        wikiData = await this.wikiService.parse(wiki.trim());
      }

      let creatorHandle = req.body.creator ? String(req.body.creator).trim() : '';
      if (!creatorHandle) {
        if (req.user && req.user.username) {
          creatorHandle = `@${req.user.username}`;
        } else {
          creatorHandle = '@community';
        }
      } else if (!creatorHandle.startsWith('@')) {
        creatorHandle = `@${creatorHandle}`;
      }

      const character = new Character({
        ...wikiData,
        ...req.body,
        creator: creatorHandle,
        name: (name && name.trim()) || wikiData.name || 'Unnamed Character',
        tagline: (req.body.tagline && req.body.tagline.trim()) || wikiData.tagline || 'AI Roleplay Character',
        avatar: (req.body.avatar && req.body.avatar.trim()) || wikiData.avatar || '',
        greeting: (req.body.greeting && req.body.greeting.trim()) || wikiData.greeting || '',
        personality: (req.body.personality && req.body.personality.trim()) || wikiData.personality || '',
        appearance: (req.body.appearance && req.body.appearance.trim()) || wikiData.appearance || '',
        abilities: (req.body.abilities && req.body.abilities.trim()) || wikiData.abilities || '',
        background: (req.body.background && req.body.background.trim()) || wikiData.background || '',
        speaking_style: (req.body.speaking_style && req.body.speaking_style.trim()) || wikiData.speaking_style || '',
        initial_memory: (req.body.initial_memory && req.body.initial_memory.trim()) || wikiData.initial_memory || '',
        wiki: (wiki && wiki.trim()) || '',
        wikiUrl: wikiData.wikiUrl || (wiki && wiki.trim()) || ''
      });

      character.recompilePrompt();
      await this.repository.save(character);

      if (character.initial_memory) {
        await this.memoryService.addMemory(character.initial_memory, character.id, 'wiki');
      }

      return this.sendJson(res, character.toJSON(), 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create character');
    }
  }

  async getCharacters(req, res) {
    try {
      const { search, category, sort } = req.query;
      const characters = await this.repository.findAllFiltered({ search, category, sort });
      return this.sendJson(res, characters.map(c => c.toJSON()));
    } catch (error) {
      return this.handleError(res, error, 'Failed to load characters');
    }
  }

  async getCharacter(req, res) {
    try {
      const character = await this.repository.findById(req.params.id);
      if (!character) {
        throw new NotFoundError('Character not found');
      }
      return this.sendJson(res, character.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to load character');
    }
  }

  async updateCharacter(req, res) {
    try {
      const character = await this.repository.findById(req.params.id);
      if (!character) {
        throw new NotFoundError('Character not found');
      }

      const updatableFields = [
        'name', 'tagline', 'avatar', 'greeting', 'personality',
        'appearance', 'abilities', 'background', 'speaking_style',
        'example_dialogues', 'initial_memory', 'wiki', 'categories', 'creator'
      ];

      for (const field of updatableFields) {
        if (req.body[field] !== undefined) {
          if (field === 'creator' && req.body[field]) {
            const raw = String(req.body[field]).trim();
            character.creator = raw.startsWith('@') ? raw : `@${raw}`;
          } else {
            character[field] = req.body[field];
          }
        }
      }

      character.validate();
      character.recompilePrompt();
      await this.repository.save(character);

      return this.sendJson(res, character.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to update character');
    }
  }

  async deleteCharacter(req, res) {
    try {
      const deleted = await this.repository.deleteById(req.params.id);
      if (!deleted) {
        throw new NotFoundError('Character not found');
      }
      return this.sendJson(res, { success: true, deletedId: req.params.id });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete character');
    }
  }

  async toggleLikeCharacter(req, res) {
    try {
      const character = await this.repository.findById(req.params.id);
      if (!character) {
        throw new NotFoundError('Character not found');
      }
      const result = character.toggleLike();
      await this.repository.save(character);
      return this.sendJson(res, result);
    } catch (error) {
      return this.handleError(res, error, 'Failed to like character');
    }
  }

  async parseWikiPreview(req, res) {
    try {
      const { url } = req.body;
      if (!url) {
        throw new ValidationError('Wiki URL is required', 'url');
      }
      const extracted = await this.wikiService.parse(url);
      return this.sendJson(res, extracted);
    } catch (error) {
      return this.handleError(res, error, 'Failed to parse Wiki URL');
    }
  }

  async generateCharacterAI(req, res) {
    try {
      const { concept } = req.body;
      if (!concept || typeof concept !== 'string' || concept.trim().length < 3) {
        throw new ValidationError('Please provide a character concept (at least 3 characters)', 'concept');
      }
      const generated = await this.aiGenerator.generateCharacterProfile(concept.trim());
      generated.avatar = Character.buildDefaultAvatar(generated.name || concept);
      return this.sendJson(res, generated);
    } catch (error) {
      return this.handleError(res, error, 'Failed to generate character with AI');
    }
  }
}

export const characterController = new CharacterController();

export const {
  createCharacter,
  getCharacters,
  getCharacter,
  updateCharacter,
  deleteCharacter,
  toggleLikeCharacter,
  parseWikiPreview,
  generateCharacterAI
} = characterController;

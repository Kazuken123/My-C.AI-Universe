import { BaseController } from './BaseController.js';
import { UserPersona } from '../models/UserPersona.js';
import { personaRepository } from '../repositories/index.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * PersonaController Class (extends BaseController)
 * Handles HTTP requests for UserPersona CRUD and active roleplay persona selection.
 */
export class PersonaController extends BaseController {
  constructor(repository = personaRepository) {
    super();
    this.repository = repository;

    this.getPersonas = this.getPersonas.bind(this);
    this.createPersona = this.createPersona.bind(this);
    this.updatePersona = this.updatePersona.bind(this);
    this.deletePersona = this.deletePersona.bind(this);
  }

  async getPersonas(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      let personas = await this.repository.findAll(userId);
      // If user is guest and has no personas, fall back to global seeded personas
      if (personas.length === 0 && !userId) {
        personas = await this.repository.findAll(null);
      }
      return this.sendJson(res, personas.map(p => p.toJSON()));
    } catch (error) {
      return this.handleError(res, error, 'Failed to load personas');
    }
  }

  async createPersona(req, res) {
    try {
      const { name, avatar, description, isDefault } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Persona name is required', 'name');
      }
      if (name.length > 100 || (description && description.length > 2000)) {
        throw new ValidationError('Persona name (max 100) or description (max 2000) exceeds length limit');
      }
      const userId = req.user ? req.user.id : null;
      if (!userId) {
        return res.status(401).json({ error: { message: 'Authentication required to create persona.', code: 401 } });
      }

      const currentPersonas = await this.repository.findAll(userId);
      const persona = new UserPersona({
        userId,
        name: name.trim(),
        avatar,
        description: description ? description.trim() : '',
        isDefault: Boolean(isDefault) || currentPersonas.length === 0
      });
      await this.repository.save(persona, userId);
      return this.sendJson(res, persona.toJSON(), 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create persona');
    }
  }

  async updatePersona(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      if (!userId) {
        return res.status(401).json({ error: { message: 'Authentication required to update persona.', code: 401 } });
      }
      const persona = await this.repository.findById(req.params.id);
      if (!persona) {
        throw new NotFoundError('Persona not found');
      }

      if (persona.userId !== userId && !req.user?.isAdmin()) {
        return res.status(403).json({
          error: { message: 'You do not have permission to edit this persona.', code: 403 }
        });
      }

      const { name, avatar, description, isDefault } = req.body;
      if (name !== undefined && name.trim()) persona.name = name.trim();
      if (avatar !== undefined && avatar.trim()) persona.avatar = avatar.trim();
      if (description !== undefined) persona.description = description.trim();
      if (isDefault) persona.activate();
      else persona.touch();

      await this.repository.save(persona, persona.userId);
      return this.sendJson(res, persona.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to update persona');
    }
  }

  async deletePersona(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      if (!userId) {
        return res.status(401).json({ error: { message: 'Authentication required to delete persona.', code: 401 } });
      }

      const target = await this.repository.findById(req.params.id);
      if (!target) {
        throw new NotFoundError('Persona not found');
      }

      // Enforce ownership check (owner or admin)
      if (target.userId !== userId && !req.user?.isAdmin()) {
        return res.status(403).json({
          error: { message: 'You do not have permission to delete this persona.', code: 403 }
        });
      }

      const ownerUserId = target.userId;
      const personas = await this.repository.findAll(ownerUserId);
      if (personas.length <= 1) {
        throw new ValidationError('Cannot delete the last remaining persona of this user');
      }

      await this.repository.deleteById(req.params.id);

      if (target.isDefault) {
        const remaining = await this.repository.findAll(ownerUserId);
        if (remaining.length > 0) {
          remaining[0].activate();
          await this.repository.save(remaining[0], ownerUserId);
        }
      }

      return this.sendJson(res, { success: true, deletedId: req.params.id });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete persona');
    }
  }
}

export const personaController = new PersonaController();

export const {
  getPersonas,
  createPersona,
  updatePersona,
  deletePersona
} = personaController;

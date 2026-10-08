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

  getPersonas(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      let personas = this.repository.findAll(userId);
      // If user is guest and has no personas, fall back to global seeded personas
      if (personas.length === 0 && !userId) {
        personas = this.repository.findAll(null);
      }
      return this.sendJson(res, personas.map(p => p.toJSON()));
    } catch (error) {
      return this.handleError(res, error, 'Failed to load personas');
    }
  }

  createPersona(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const { name, avatar, description, isDefault } = req.body;
      const currentPersonas = this.repository.findAll(userId);
      const persona = new UserPersona({
        userId,
        name,
        avatar,
        description,
        isDefault: Boolean(isDefault) || currentPersonas.length === 0
      });
      this.repository.save(persona, userId);
      return this.sendJson(res, persona.toJSON(), 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create persona');
    }
  }

  updatePersona(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const persona = this.repository.findById(req.params.id, userId);
      if (!persona) {
        throw new NotFoundError('Persona not found');
      }

      const { name, avatar, description, isDefault } = req.body;
      if (name !== undefined && name.trim()) persona.name = name.trim();
      if (avatar !== undefined && avatar.trim()) persona.avatar = avatar.trim();
      if (description !== undefined) persona.description = description.trim();
      if (isDefault) persona.activate();
      else persona.touch();

      this.repository.save(persona, userId);
      return this.sendJson(res, persona.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to update persona');
    }
  }

  deletePersona(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const personas = this.repository.findAll(userId);
      if (personas.length <= 1) {
        throw new ValidationError('Cannot delete the last remaining persona');
      }
      const target = this.repository.findById(req.params.id);
      if (!target) {
        throw new NotFoundError('Persona not found');
      }

      this.repository.deleteById(req.params.id);

      if (target.isDefault) {
        const remaining = this.repository.findAll();
        if (remaining.length > 0) {
          remaining[0].activate();
          this.repository.save(remaining[0]);
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

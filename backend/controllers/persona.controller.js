import { storage } from '../services/storage.service.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';

/**
 * Get all user personas
 */
export function getPersonas(req, res) {
  try {
    const personas = storage.getPersonas();
    res.json(personas);
  } catch (error) {
    res.status(500).json({
      error: { message: 'Failed to load personas', code: 500 }
    });
  }
}

/**
 * Create a new user persona
 */
export function createPersona(req, res) {
  try {
    const { name, avatar, description, isDefault } = req.body;
    if (!name || !name.trim()) {
      throw new ValidationError('Persona name is required', 'name');
    }

    const personas = storage.getPersonas();
    const now = new Date().toISOString();

    if (isDefault) {
      personas.forEach(p => { p.isDefault = false; });
    }

    const newPersona = {
      id: `persona_${Date.now()}`,
      name: name.trim(),
      avatar: (avatar && avatar.trim()) || '👤',
      description: (description && description.trim()) || '',
      isDefault: Boolean(isDefault) || personas.length === 0,
      createdAt: now,
      updatedAt: now
    };

    personas.push(newPersona);
    storage.savePersonas(personas);

    res.status(201).json(newPersona);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to create persona', code }
    });
  }
}

/**
 * Update or set default user persona
 */
export function updatePersona(req, res) {
  try {
    const { id } = req.params;
    const { name, avatar, description, isDefault } = req.body;

    const personas = storage.getPersonas();
    const idx = personas.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new NotFoundError('Persona not found');
    }

    if (isDefault) {
      personas.forEach(p => { p.isDefault = false; });
      personas[idx].isDefault = true;
    }

    if (name !== undefined && name.trim()) personas[idx].name = name.trim();
    if (avatar !== undefined && avatar.trim()) personas[idx].avatar = avatar.trim();
    if (description !== undefined) personas[idx].description = description.trim();
    personas[idx].updatedAt = new Date().toISOString();

    storage.savePersonas(personas);
    res.json(personas[idx]);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to update persona', code }
    });
  }
}

/**
 * Delete a user persona
 */
export function deletePersona(req, res) {
  try {
    const { id } = req.params;
    const personas = storage.getPersonas();
    if (personas.length <= 1) {
      throw new ValidationError('Cannot delete the last remaining persona');
    }

    const target = personas.find(p => p.id === id);
    if (!target) {
      throw new NotFoundError('Persona not found');
    }

    const filtered = personas.filter(p => p.id !== id);
    if (target.isDefault && filtered.length > 0) {
      filtered[0].isDefault = true;
    }

    storage.savePersonas(filtered);
    res.json({ success: true, deletedId: id });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to delete persona', code }
    });
  }
}

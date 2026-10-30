import crypto from 'node:crypto';
import { BaseEntity } from './BaseEntity.js';
import { ValidationError } from '../ai/errors.js';
import { compileCharacterSystemPrompt, generateDefaultGreeting } from '../ai/prompt/characterPrompt.js';
import { RESERVED_USERNAMES } from '../config/index.js';

/**
 * Character Domain Entity Class
 * Inherits from BaseEntity and encapsulates Character attributes, lore compilation, and interaction state.
 */
export const SAFE_VOICE_ID_REGEX = /^[a-zA-Z0-9_-]{0,64}$/;
export const ALLOWED_VOICE_PROVIDERS = new Set(['', 'fish_audio', 'browser']);

export class Character extends BaseEntity {
  static ALLOWED_UPDATE_FIELDS = [
    'name', 'tagline', 'greeting', 'personality', 'appearance',
    'abilities', 'background', 'summary', 'speaking_style', 'initial_memory',
    'initial_affinity', 'initial_relationship_stage', 'relationship_dynamic', 'voice_provider', 'voice_id', 'voice_name'
  ];

  constructor(props = {}) {
    super({
      id: props.id || null,
      createdAt: props.createdAt || props.created_at,
      updatedAt: props.updatedAt || props.updated_at
    });

    this.name = (props.name || '').trim() || 'Unnamed Character';
    this.tagline = (props.tagline || '').trim() || 'AI Roleplay Character';
    this.avatar = (props.avatar || '').trim() || Character.buildDefaultAvatar(this.name);
    this.greeting = (props.greeting || '').trim();
    this.personality = (props.personality || '').trim();
    this.appearance = (props.appearance || '').trim();
    this.abilities = (props.abilities || '').trim();
    this.background = (props.background || '').trim();
    this.speaking_style = (props.speaking_style || props.speakingStyle || '').trim();
    this.example_dialogues = (props.example_dialogues || props.exampleDialogues || '').trim();
    this.initial_memory = (props.initial_memory || props.initialMemory || '').trim();
    this.initialAffinity = Math.max(-100, Math.min(100, Number(props.initialAffinity ?? props.initial_affinity ?? 0)));
    this.initialRelationshipStage = (props.initialRelationshipStage || props.initial_relationship_stage || 'Stranger / Neutral').trim();
    this.relationshipDynamic = (props.relationshipDynamic || props.relationship_dynamic || '').trim();
    this.voiceProvider = (props.voiceProvider || props.voice_provider || 'fish_audio').trim();
    this.voiceId = (props.voiceId || props.voice_id || '').trim();
    this.voiceName = (props.voiceName || props.voice_name || '').trim();
    this.wiki = (props.wiki || '').trim();
    this.wikiUrl = (props.wikiUrl || props.wiki_url || this.wiki || '').trim();
    this.categories = Array.isArray(props.categories) && props.categories.length > 0
      ? props.categories
      : ['Roleplay', 'Original'];
    this.creator = props.creator || '@community';
    this.ownerUserId = props.ownerUserId || props.owner_user_id || null;
    this.interactions = Number(props.interactions) || 0;
    this.likes = props.likes !== undefined ? Number(props.likes) : 0;
    this.isLiked = Boolean(props.isLiked ?? props.is_liked ?? false);

    // Ensure greeting and systemPrompt are always compiled
    this.greeting = generateDefaultGreeting(this);
    this.systemPrompt = props.systemPrompt || props.system_prompt || compileCharacterSystemPrompt(this);
  }

  get voice_provider() { return this.voiceProvider; }
  set voice_provider(val) { this.voiceProvider = (val || 'fish_audio').trim(); }
  get voice_id() { return this.voiceId; }
  set voice_id(val) { this.voiceId = (val || '').trim(); }
  get voice_name() { return this.voiceName; }
  set voice_name(val) { this.voiceName = (val || '').trim(); }

  get initial_affinity() {
    return this.initialAffinity;
  }
  set initial_affinity(val) {
    this.initialAffinity = Math.max(-100, Math.min(100, Number(val ?? 0)));
  }

  get initial_relationship_stage() {
    return this.initialRelationshipStage;
  }
  set initial_relationship_stage(val) {
    this.initialRelationshipStage = String(val || 'Stranger / Neutral').trim();
  }

  get relationship_dynamic() {
    return this.relationshipDynamic;
  }
  set relationship_dynamic(val) {
    this.relationshipDynamic = String(val || '').trim();
  }

  /**
   * Domain authorization rule: checks if a given user has permission to modify/delete this character
   * @param {Object} user
   * @returns {boolean}
   */
  canModify(user) {
    if (!user) return false;
    if (typeof user.isAdmin === 'function' && user.isAdmin()) return true;
    if (user.role === 'admin') return true;
    if (this.ownerUserId) {
      return Boolean(user.id && this.ownerUserId === user.id);
    }
    const creatorHandle = String(this.creator || '').trim().toLowerCase();
    const cleanHandle = creatorHandle.startsWith('@') ? creatorHandle.slice(1) : creatorHandle;
    if (RESERVED_USERNAMES.has(cleanHandle)) {
      return false;
    }
    if (creatorHandle && user.username && creatorHandle === `@${user.username.toLowerCase()}`) {
      return true;
    }
    return false;
  }

  static buildDefaultAvatar(name) {
    const seed = encodeURIComponent((name || 'Character').replace(/\s+/g, ''));
    return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  }

  /**
   * Validate character domain invariants
   */
  validate() {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationError('Character name is required', 'name');
    }
    if (this.name.length > 100) {
      throw new ValidationError('Character name too long (max 100 characters)', 'name');
    }
    if (this.tagline && this.tagline.length > 300) {
      throw new ValidationError('Tagline too long (max 300 characters)', 'tagline');
    }
    if (this.personality && this.personality.length > 5000) {
      throw new ValidationError('Personality description too long (max 5000 characters)', 'personality');
    }
    if (this.background && this.background.length > 5000) {
      throw new ValidationError('Background description too long (max 5000 characters)', 'background');
    }
    if (this.appearance && this.appearance.length > 3000) {
      throw new ValidationError('Appearance description too long (max 3000 characters)', 'appearance');
    }
    if (this.abilities && this.abilities.length > 3000) {
      throw new ValidationError('Abilities description too long (max 3000 characters)', 'abilities');
    }
    if (this.speaking_style && this.speaking_style.length > 2000) {
      throw new ValidationError('Speaking style too long (max 2000 characters)', 'speaking_style');
    }
    if (this.greeting && this.greeting.length > 3000) {
      throw new ValidationError('Greeting message too long (max 3000 characters)', 'greeting');
    }
    if (this.initial_memory && this.initial_memory.length > 3000) {
      throw new ValidationError('Initial memory too long (max 3000 characters)', 'initial_memory');
    }
    if (this.voiceId && !SAFE_VOICE_ID_REGEX.test(this.voiceId)) {
      throw new ValidationError('Invalid voice ID format', 'voice_id');
    }
    if (this.voiceName && this.voiceName.length > 120) {
      throw new ValidationError('Voice name too long (max 120 characters)', 'voice_name');
    }
    if (this.example_dialogues && this.example_dialogues.length > 5000) {
      throw new ValidationError('Example dialogues too long (max 5000 characters)', 'example_dialogues');
    }
    return true;
  }

  /**
   * Recompile the system prompt and default greeting after attribute changes
   */
  recompilePrompt() {
    this.greeting = generateDefaultGreeting(this);
    this.systemPrompt = compileCharacterSystemPrompt(this);
    this.touch();
  }

  /**
   * Toggle like status and adjust like counter
   */
  toggleLike() {
    this.isLiked = !this.isLiked;
    this.likes = Math.max(0, this.likes + (this.isLiked ? 1 : -1));
    this.touch();
    return { id: this.id, likes: this.likes, isLiked: this.isLiked };
  }

  /**
   * Increment total interaction count
   */
  incrementInteractions() {
    this.interactions += 1;
    this.touch();
  }

  /**
   * Apply an in-chat `/update field: value` command
   */
  applyFieldUpdate(field, value) {
    const normalizedField = (field || '').trim().toLowerCase();
    if (!Character.ALLOWED_UPDATE_FIELDS.includes(normalizedField)) {
      throw new ValidationError(
        `Cannot update field '${normalizedField}'. Allowed fields: ${Character.ALLOWED_UPDATE_FIELDS.join(', ')}`
      );
    }
    this[normalizedField] = value;
    this.recompilePrompt();
    return `✅ Updated **${normalizedField}** to: *${value}*`;
  }

  /**
   * Factory method: Hydrate Character instance from SQL database row
   */
  static fromDatabaseRow(row) {
    if (!row) return null;
    let categories = ['Roleplay'];
    try {
      categories = JSON.parse(row.categories_json || '["Roleplay"]');
    } catch {
      categories = ['Roleplay'];
    }
    return new Character({
      id: row.id,
      name: row.name,
      tagline: row.tagline,
      avatar: row.avatar,
      greeting: row.greeting,
      personality: row.personality,
      appearance: row.appearance,
      abilities: row.abilities,
      background: row.background,
      speaking_style: row.speaking_style,
      example_dialogues: row.example_dialogues,
      initial_memory: row.initial_memory,
      initialAffinity: row.initial_affinity,
      initialRelationshipStage: row.initial_relationship_stage,
      relationshipDynamic: row.relationship_dynamic,
      voiceProvider: row.voice_provider,
      voiceId: row.voice_id,
      voiceName: row.voice_name,
      systemPrompt: row.system_prompt,
      wiki: row.wiki,
      wikiUrl: row.wiki_url,
      categories,
      creator: row.creator,
      ownerUserId: row.owner_user_id,
      interactions: row.interactions,
      likes: row.likes,
      isLiked: Boolean(row.is_liked),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      tagline: this.tagline,
      avatar: this.avatar,
      greeting: this.greeting,
      personality: this.personality,
      appearance: this.appearance,
      abilities: this.abilities,
      background: this.background,
      speaking_style: this.speaking_style,
      example_dialogues: this.example_dialogues,
      initial_memory: this.initial_memory,
      initialAffinity: this.initialAffinity,
      initial_affinity: this.initialAffinity,
      initialRelationshipStage: this.initialRelationshipStage,
      initial_relationship_stage: this.initialRelationshipStage,
      relationshipDynamic: this.relationshipDynamic,
      relationship_dynamic: this.relationshipDynamic,
      voice_provider: this.voiceProvider,
      voiceProvider: this.voiceProvider,
      voice_id: this.voiceId,
      voiceId: this.voiceId,
      voice_name: this.voiceName,
      voiceName: this.voiceName,
      systemPrompt: this.systemPrompt,
      wiki: this.wiki,
      wikiUrl: this.wikiUrl,
      categories: this.categories,
      creator: this.creator,
      ownerUserId: this.ownerUserId,
      interactions: this.interactions,
      likes: this.likes,
      isLiked: this.isLiked,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

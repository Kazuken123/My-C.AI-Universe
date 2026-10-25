import crypto from 'node:crypto';
import { BaseEntity } from './BaseEntity.js';

/**
 * MessageVariant Domain Entity Class
 * Represents a single swipeable response alternative within a ChatMessage.
 */
export class MessageVariant extends BaseEntity {
  constructor(props = {}) {
    super({
      id: props.id || `var_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      createdAt: props.createdAt || props.created_at
    });
    this.messageId = props.messageId || props.message_id || '';
    this.variantIndex = Number(props.variantIndex ?? props.variant_index ?? 0);
    this.text = props.text || '';
  }

  static fromDatabaseRow(row) {
    if (!row) return null;
    return new MessageVariant({
      id: row.id,
      messageId: row.message_id,
      variantIndex: row.variant_index,
      text: row.text,
      createdAt: row.created_at
    });
  }

  toJSON() {
    return {
      id: this.id,
      text: this.text,
      createdAt: this.createdAt
    };
  }
}

/**
 * ChatMessage Domain Entity Class (Composition of MessageVariants)
 */
export class ChatMessage extends BaseEntity {
  constructor(props = {}) {
    super({
      id: props.id || `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      createdAt: props.createdAt || props.created_at
    });
    this.sessionId = props.sessionId || props.session_id || '';
    this.role = props.role || 'model';
    this.content = props.content || '';
    this.selectedVariantIndex = Number(props.selectedVariantIndex ?? props.selected_variant_index ?? 0);
    this.isPinned = Boolean(props.isPinned ?? props.is_pinned ?? false);
    this.rating = Number(props.rating ?? 0);
    this.position = Number(props.position ?? 0);

    const rawVariants = Array.isArray(props.variants) && props.variants.length > 0
      ? props.variants
      : [{ id: `${this.id}_v1`, text: this.content, createdAt: this.createdAt }];

    this.variants = rawVariants.map((v, idx) =>
      v instanceof MessageVariant
        ? v
        : new MessageVariant({
            id: v.id || `${this.id}_v${idx + 1}`,
            messageId: this.id,
            variantIndex: idx,
            text: v.text ?? this.content,
            createdAt: v.createdAt || this.createdAt
          })
    );
  }

  /**
   * Add a newly regenerated swipe variant and select it
   */
  addVariant(text) {
    const newVar = new MessageVariant({
      id: `${this.id}_v${this.variants.length + 1}`,
      messageId: this.id,
      variantIndex: this.variants.length,
      text,
      createdAt: new Date().toISOString()
    });
    this.variants.push(newVar);
    this.selectedVariantIndex = this.variants.length - 1;
    this.content = text;
    return newVar;
  }

  /**
   * Switch active swipe variant index
   */
  selectVariant(index) {
    if (index >= 0 && index < this.variants.length) {
      this.selectedVariantIndex = index;
      this.content = this.variants[index].text;
    }
  }

  /**
   * Edit the active message content in place
   */
  updateContent(newText) {
    this.content = newText.trim();
    if (this.variants[this.selectedVariantIndex]) {
      this.variants[this.selectedVariantIndex].text = this.content;
    }
  }

  static fromDatabaseRow(row, variantRows = []) {
    if (!row) return null;
    const variants = variantRows.map(v => MessageVariant.fromDatabaseRow(v));
    return new ChatMessage({
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      selectedVariantIndex: row.selected_variant_index,
      isPinned: Boolean(row.is_pinned),
      rating: row.rating,
      position: row.position,
      createdAt: row.created_at,
      variants
    });
  }

  toJSON() {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      selectedVariantIndex: this.selectedVariantIndex,
      isPinned: this.isPinned,
      rating: this.rating,
      createdAt: this.createdAt,
      variants: this.variants.map(v => v.toJSON())
    };
  }
}

/**
 * ChatSession Domain Entity Class (Aggregation of ChatMessages)
 */
export class ChatSession extends BaseEntity {
  constructor(props = {}) {
    super({
      id: props.id || `chat_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: props.createdAt || props.created_at,
      updatedAt: props.updatedAt || props.updated_at
    });
    this.userId = props.userId || props.user_id || null;
    this.characterId = props.characterId || props.character_id;
    this.personaId = props.personaId || props.persona_id || 'persona_default';
    this.title = props.title || 'Chat';
    this.provider = props.provider || 'gemini';
    this.affinity = Number(props.affinity ?? 0);
    this.trust = Number(props.trust ?? this.affinity);
    this.strain = Number(props.strain ?? 0);
    this.relationshipStage = props.relationshipStage || props.relationship_stage || 'Stranger / Neutral';
    this.relationshipMood = props.relationshipMood || props.relationship_mood || 'Calm';
    this.messages = Array.isArray(props.messages)
      ? props.messages.map((m, idx) =>
          m instanceof ChatMessage ? m : new ChatMessage({ ...m, sessionId: this.id, position: idx })
        )
      : [];
  }

  addMessage(msgProps) {
    const msg = msgProps instanceof ChatMessage
      ? msgProps
      : new ChatMessage({ ...msgProps, sessionId: this.id, position: this.messages.length });
    this.messages.push(msg);
    this.touch();
    return msg;
  }

  getPinnedMessages() {
    return this.messages.filter(m => m.isPinned);
  }

  getLastModelMessage() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'model') return this.messages[i];
    }
    return null;
  }

  rewindToMessage(messageId) {
    const idx = this.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return false;
    this.messages = this.messages.slice(0, idx + 1);
    this.touch();
    return true;
  }

  static fromDatabaseRow(row, messages = []) {
    if (!row) return null;
    return new ChatSession({
      id: row.id,
      userId: row.user_id || null,
      characterId: row.character_id,
      personaId: row.persona_id || 'persona_default',
      title: row.title,
      provider: row.provider || 'gemini',
      affinity: row.affinity,
      trust: row.trust,
      strain: row.strain,
      relationshipStage: row.relationship_stage,
      relationshipMood: row.relationship_mood,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messages
    });
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      characterId: this.characterId,
      personaId: this.personaId,
      title: this.title,
      provider: this.provider,
      affinity: this.affinity,
      trust: this.trust,
      strain: this.strain,
      relationshipStage: this.relationshipStage,
      relationshipMood: this.relationshipMood,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      messages: this.messages.map(m => m.toJSON())
    };
  }
}

import { BaseController } from './BaseController.js';
import { ChatSession, ChatMessage } from '../models/ChatSession.js';
import {
  characterRepository,
  chatSessionRepository,
  personaRepository
} from '../repositories/index.js';
import { aiOrchestrator } from '../ai/index.js';
import { memoryService } from '../services/memory.service.js';
import { generateDefaultGreeting } from '../ai/prompt/characterPrompt.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';
import { config } from '../config/index.js';

/**
 * ChatController Class (extends BaseController)
 * Encapsulates ChatSession lifecycle, AI roleplay generation, variant swiping, scene continuation, and message rewind.
 */
export class ChatController extends BaseController {
  constructor(
    sessionsRepo = chatSessionRepository,
    charsRepo = characterRepository,
    personasRepo = personaRepository,
    memService = memoryService,
    orchestrator = aiOrchestrator
  ) {
    super();
    this.sessionsRepo = sessionsRepo;
    this.charsRepo = charsRepo;
    this.personasRepo = personasRepo;
    this.memoryService = memService;
    this.orchestrator = orchestrator;

    this.getChatSessions = this.getChatSessions.bind(this);
    this.createChatSession = this.createChatSession.bind(this);
    this.getChatSession = this.getChatSession.bind(this);
    this.deleteChatSession = this.deleteChatSession.bind(this);
    this.updateChatMessage = this.updateChatMessage.bind(this);
    this.rewindChatSession = this.rewindChatSession.bind(this);
    this.sendChatMessage = this.sendChatMessage.bind(this);
  }

  /**
   * Build a new ChatSession entity seeded with the character's opening greeting
   */
  #createNewSessionEntity(character, personaId = null, provider = 'gemini', title = '', userId = null) {
    const greetingText = generateDefaultGreeting(character);
    const session = new ChatSession({
      userId: userId || null,
      characterId: character.id,
      personaId: personaId || 'persona_default',
      title: title || `Chat with ${character.name}`,
      provider: provider || config.AI_PROVIDER || 'gemini'
    });

    session.addMessage(new ChatMessage({
      sessionId: session.id,
      role: 'model',
      content: greetingText,
      position: 0
    }));

    return session;
  }

  async getChatSessions(req, res) {
    try {
      const { characterId } = req.query;
      const userId = req.user ? req.user.id : null;
      if (!userId) {
        return this.sendJson(res, []);
      }
      const characters = await this.charsRepo.findAll();
      const charMap = new Map(characters.map(c => [c.id, c]));
      const sessions = await this.sessionsRepo.findAll(characterId || null, userId);

      const enriched = sessions.map(chat => {
        const char = charMap.get(chat.characterId);
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
        return {
          id: chat.id,
          userId: chat.userId,
          characterId: chat.characterId,
          characterName: char ? char.name : 'Unknown Character',
          characterAvatar: char ? char.avatar : '',
          characterTagline: char ? char.tagline : '',
          personaId: chat.personaId,
          title: chat.title || (char ? `Chat with ${char.name}` : 'Chat'),
          provider: chat.provider,
          messageCount: chat.messages.length,
          lastMessage: lastMsg ? lastMsg.content : '',
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt
        };
      });

      return this.sendJson(res, enriched);
    } catch (error) {
      return this.handleError(res, error, 'Failed to list chat sessions');
    }
  }

  async createChatSession(req, res) {
    try {
      const { characterId, personaId, provider, title } = req.body;
      const userId = req.user ? req.user.id : null;
      if (!characterId) {
        throw new ValidationError('characterId is required', 'characterId');
      }

      const character = await this.charsRepo.findById(characterId);
      if (!character) {
        throw new NotFoundError('Character not found');
      }

      const activePersona =
        (personaId && (await this.personasRepo.findById(personaId, userId))) ||
        (await this.personasRepo.findDefault(userId));

      const session = this.#createNewSessionEntity(
        character,
        activePersona ? activePersona.id : 'persona_default',
        provider,
        title,
        userId
      );

      await this.sessionsRepo.save(session);
      return this.sendJson(res, session.toJSON(), 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create chat session');
    }
  }

  async getChatSession(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const session = await this.sessionsRepo.findById(req.params.sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }
      return this.sendJson(res, session.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to load chat session');
    }
  }

  async deleteChatSession(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const session = await this.sessionsRepo.findById(req.params.sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }
      const deleted = await this.sessionsRepo.deleteById(req.params.sessionId);
      if (!deleted) {
        throw new NotFoundError('Chat session not found');
      }
      return this.sendJson(res, { success: true, deletedId: req.params.sessionId });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete chat session');
    }
  }

  async updateChatMessage(req, res) {
    try {
      const { sessionId, messageId } = req.params;
      const userId = req.user ? req.user.id : null;
      const { content, selectedVariantIndex, isPinned, rating } = req.body;

      const session = await this.sessionsRepo.findById(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }

      const msg = session.messages.find(m => m.id === messageId);
      if (!msg) {
        throw new NotFoundError('Message not found');
      }

      const updateFields = {};
      if (typeof selectedVariantIndex === 'number') {
        msg.selectVariant(selectedVariantIndex);
        updateFields.selectedVariantIndex = msg.selectedVariantIndex;
        updateFields.content = msg.content;
      }
      if (typeof content === 'string' && content.trim()) {
        if (content.length > config.MAX_MESSAGE_LENGTH) {
          throw new ValidationError(`Message content too long (max ${config.MAX_MESSAGE_LENGTH} characters)`, 'content');
        }
        msg.updateContent(content);
        updateFields.content = msg.content;
      }
      if (typeof isPinned === 'boolean') {
        msg.isPinned = isPinned;
        updateFields.isPinned = isPinned;
      }
      if (typeof rating === 'number' && rating >= 0 && rating <= 4) {
        msg.rating = rating;
        updateFields.rating = rating;
      }

      session.touch();
      await this.sessionsRepo.updateMessageFields(sessionId, messageId, updateFields);

      return this.sendJson(res, {
        message: msg.toJSON(),
        session: session.toJSON()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to update message');
    }
  }

  async rewindChatSession(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user ? req.user.id : null;
      const { messageId } = req.body;

      const session = await this.sessionsRepo.findById(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }

      if (!session.rewindToMessage(messageId)) {
        throw new NotFoundError('Target message not found in session');
      }

      await this.sessionsRepo.save(session);
      return this.sendJson(res, session.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to rewind chat session');
    }
  }

  async sendChatMessage(req, res) {
    try {
      const userId = req.user ? req.user.id : null;
      const {
        charId,
        sessionId,
        personaId,
        provider,
        message,
        memory: clientMemory,
        regenerate,
        previousResponse,
        continue: isContinue,
        lastMessage,
        excludeVariants,
        continueFromAssistant
      } = req.body;

      if (!charId || typeof charId !== 'string') {
        throw new ValidationError('Character ID is required', 'charId');
      }

      if (isContinue) {
        if (!lastMessage && (!clientMemory || clientMemory.length === 0) && !sessionId) {
          throw new ValidationError('Last assistant message or active session is required for continuation', 'lastMessage');
        }
      } else if (regenerate) {
        if (!message && !sessionId) {
          throw new ValidationError('Message or sessionId is required for regeneration', 'message');
        }
      } else {
        if (!message && (!clientMemory || clientMemory.length === 0)) {
          throw new ValidationError('Message is required', 'message');
        }
      }

      if (message && message.length > config.MAX_MESSAGE_LENGTH) {
        throw new ValidationError(`Message too long (max ${config.MAX_MESSAGE_LENGTH} characters)`, 'message');
      }

      const character = await this.charsRepo.findById(charId);
      if (!character) {
        throw new ValidationError('Character not found', 'charId');
      }

      // Handle in-chat /update command via Character OOP domain method
      if (message && message.trim().startsWith('/update ')) {
        const updateCmd = message.trim().substring(8).trim();
        const colonIdx = updateCmd.indexOf(':');
        if (!updateCmd || colonIdx === -1) {
          throw new ValidationError('Invalid update command. Use format: /update field: value');
        }
        const field = updateCmd.substring(0, colonIdx).trim();
        const value = updateCmd.substring(colonIdx + 1).trim();
        const feedback = character.applyFieldUpdate(field, value);
        await this.charsRepo.save(character);
        return this.sendJson(res, {
          response: feedback,
          characterUpdated: character.toJSON()
        });
      }

      // Load or create ChatSession entity
      let session = sessionId ? await this.sessionsRepo.findById(sessionId, userId) : null;
      if (!session) {
        const existingForChar = await this.sessionsRepo.findAll(charId, userId);
        session = existingForChar[0] || null;
      }

      const activePersona =
        (personaId && (await this.personasRepo.findById(personaId, userId))) ||
        (session?.personaId && (await this.personasRepo.findById(session.personaId, userId))) ||
        (await this.personasRepo.findDefault(userId));

      if (!session) {
        session = this.#createNewSessionEntity(
          character,
          activePersona ? activePersona.id : 'persona_default',
          provider || config.AI_PROVIDER,
          '',
          userId
        );
      }

      if (personaId) session.personaId = personaId;
      if (provider) session.provider = provider;

      const pinnedMessages = session.getPinnedMessages().map(m => m.toJSON());
      const effectiveHistory = Array.isArray(clientMemory) && clientMemory.length > 0
        ? clientMemory.slice(-config.MAX_MEMORY_MESSAGES)
        : session.messages
            .slice(-config.MAX_MEMORY_MESSAGES)
            .map(m => ({
              role: m.role,
              content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
            }));

      const queryForMemory = message || lastMessage || character.name;
      const relevantMemories = await this.memoryService.retrieveRelevantMemories(queryForMemory, charId, 4);

      const aiOptions = {
        provider: provider || session.provider || config.AI_PROVIDER,
        persona: activePersona ? activePersona.toJSON() : null,
        pinnedMessages,
        memories: relevantMemories
      };

      // Case 1: Regenerate Swipe Variant
      if (regenerate) {
        const sessionMsgs = session.messages;
        const lastModelIdx = sessionMsgs.map(m => m.role).lastIndexOf('model');
        const targetModelMsg = lastModelIdx !== -1 ? sessionMsgs[lastModelIdx] : null;
        if (!targetModelMsg) {
          throw new ValidationError('No character message found to regenerate', 'regenerate');
        }

        const isContinuationTurn = Boolean(req.body.isContinuation) ||
          (lastModelIdx > 0 && sessionMsgs[lastModelIdx - 1].role === 'model');

        const existingVariants = Array.isArray(excludeVariants) && excludeVariants.length > 0
          ? excludeVariants
          : (targetModelMsg ? targetModelMsg.variants.map(v => v.text) : (previousResponse ? [previousResponse] : []));

        const userName = activePersona ? activePersona.name : 'the user';
        let reply;

        if (isContinuationTurn) {
          const anchorMsg = lastModelIdx > 0
            ? ((sessionMsgs[lastModelIdx - 1].variants &&
                sessionMsgs[lastModelIdx - 1].variants[sessionMsgs[lastModelIdx - 1].selectedVariantIndex]?.text) ||
               sessionMsgs[lastModelIdx - 1].content)
            : (lastMessage || '');

          // Keep all previous turns including the anchor character turn right before this continuation
          const historyBeforeContinuation = sessionMsgs
            .slice(0, lastModelIdx)
            .slice(-config.MAX_MEMORY_MESSAGES)
            .map(m => ({
              role: m.role,
              content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
            }));

          const regeneratePrompt = `[Scene Continuation - Alternative Take Directive]
The user (${userName}) remains quiet/silent and did NOT speak or take any action. Do NOT act or speak as the user, and do NOT react as if the user just replied.
Continue the roleplay scene naturally from your perspective as ${character.name}.
Advance the moment forward from your previous message below with a fresh, distinct action, movement, quiet reflection, or spoken line:
"""
${anchorMsg}
"""

Rules:
- Write in light-novel style (*italic narration/actions*, ${character.name}: "Dialogue").
- Do NOT repeat what happened in your previous takes:
${existingVariants.length > 0 ? existingVariants.map(v => `  * "${v.slice(0, 140)}"`).join('\n') : '  (None)'}
- Do NOT speak or act for ${userName}.`;

          reply = await this.orchestrator.chat(character.toJSON(), regeneratePrompt, historyBeforeContinuation, aiOptions);
        } else {
          const precedingUserMsg = lastModelIdx > 0 && sessionMsgs[lastModelIdx - 1].role === 'user'
            ? ((sessionMsgs[lastModelIdx - 1].variants &&
                sessionMsgs[lastModelIdx - 1].variants[sessionMsgs[lastModelIdx - 1].selectedVariantIndex]?.text) ||
               sessionMsgs[lastModelIdx - 1].content)
            : (message || 'Continue roleplay');

          const historyBeforeLastModel = lastModelIdx > 0
            ? sessionMsgs.slice(0, lastModelIdx - 1).slice(-config.MAX_MEMORY_MESSAGES).map(m => ({
                role: m.role,
                content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
              }))
            : effectiveHistory.slice(0, -1);

          const regeneratePrompt = `Generate a fresh, distinct alternative reply to this user message:
"${precedingUserMsg}"

Rules:
- Use different wording, actions, and angle while staying completely in character as ${character.name}
- Keep the light-novel formatting (*italic actions* and ${character.name}: "Dialogue")
${existingVariants.length > 0 ? `- Do NOT repeat these previous variants:\n${existingVariants.map(v => `  * "${v.slice(0, 140)}"`).join('\n')}` : ''}`;

          reply = await this.orchestrator.chat(character.toJSON(), regeneratePrompt, historyBeforeLastModel, aiOptions);
        }

        if (targetModelMsg) {
          targetModelMsg.addVariant(reply);
        }
        session.touch();
        await this.sessionsRepo.save(session);

        return this.sendJson(res, {
          response: reply || 'AI did not respond',
          regenerated: true,
          sessionId: session.id,
          message: targetModelMsg ? targetModelMsg.toJSON() : null
        });
      }

      // Case 2: Scene Continuation
      if (isContinue) {
        const lastSessionMsg = session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
        const anchorMsg = lastMessage ||
          (lastSessionMsg
            ? ((lastSessionMsg.variants && lastSessionMsg.variants[lastSessionMsg.selectedVariantIndex]?.text) || lastSessionMsg.content)
            : '');

        const userName = activePersona ? activePersona.name : 'the user';
        const continuationPrompt = `[Scene Continuation Directive]
The user (${userName}) has NOT spoken and has taken no new action (they remain silent, resting, or observing).
Do NOT treat this as a new response from the user. Do NOT react as if the user just spoke or replied to you.
Continue the roleplay scene naturally from your perspective as ${character.name}.
Advance the moment forward: describe your character's next physical movement, expression, quiet thoughts, or ongoing dialogue.
Maintain natural continuity with what you just said or did in your previous message:
"""
${anchorMsg}
"""
Write in light-novel style with *italicized narration/actions* and dialogue formatted as ${character.name}: "Dialogue".
Do not repeat your previous words. Do not speak or act for ${userName}.`;

        const reply = await this.orchestrator.chat(character.toJSON(), continuationPrompt, effectiveHistory, aiOptions);

        const newAiMsg = session.addMessage({
          role: 'model',
          content: reply
        });
        await this.sessionsRepo.save(session);

        character.incrementInteractions();
        await this.charsRepo.save(character);

        return this.sendJson(res, {
          response: reply || 'AI did not respond',
          continuation: true,
          sessionId: session.id,
          message: newAiMsg.toJSON()
        });
      }

      // Case 3: Standard User Chat Turn
      const userMsgObj = session.addMessage({
        role: 'user',
        content: message.trim()
      });

      const reply = await this.orchestrator.chat(character.toJSON(), message.trim(), effectiveHistory, aiOptions);

      const aiMsgObj = session.addMessage({
        role: 'model',
        content: reply
      });

      await this.sessionsRepo.save(session);

      character.incrementInteractions();
      await this.charsRepo.save(character);

      if (reply) {
        this.memoryService.detectAndStoreFromTurn(message, reply, charId, session.id);
      }

      return this.sendJson(res, {
        response: reply || 'AI did not respond',
        sessionId: session.id,
        userMessage: userMsgObj.toJSON(),
        aiMessage: aiMsgObj.toJSON(),
        memoriesUsed: relevantMemories.length
      });
    } catch (error) {
      return this.handleError(res, error, 'Chat service temporarily unavailable');
    }
  }
}

export const chatController = new ChatController();

export const {
  getChatSessions,
  createChatSession,
  getChatSession,
  deleteChatSession,
  updateChatMessage,
  rewindChatSession,
  sendChatMessage
} = chatController;

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
  #createNewSessionEntity(character, personaId = null, provider = 'gemini', title = '') {
    const greetingText = generateDefaultGreeting(character);
    const session = new ChatSession({
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

  getChatSessions(req, res) {
    try {
      const { characterId } = req.query;
      const characters = this.charsRepo.findAll();
      const charMap = new Map(characters.map(c => [c.id, c]));
      const sessions = this.sessionsRepo.findAll(characterId || null);

      const enriched = sessions.map(chat => {
        const char = charMap.get(chat.characterId);
        const lastMsg = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
        return {
          id: chat.id,
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

  createChatSession(req, res) {
    try {
      const { characterId, personaId, provider, title } = req.body;
      if (!characterId) {
        throw new ValidationError('characterId is required', 'characterId');
      }

      const character = this.charsRepo.findById(characterId);
      if (!character) {
        throw new NotFoundError('Character not found');
      }

      const activePersona =
        (personaId && this.personasRepo.findById(personaId)) ||
        this.personasRepo.findDefault();

      const session = this.#createNewSessionEntity(
        character,
        activePersona ? activePersona.id : 'persona_default',
        provider,
        title
      );

      this.sessionsRepo.save(session);
      return this.sendJson(res, session.toJSON(), 201);
    } catch (error) {
      return this.handleError(res, error, 'Failed to create chat session');
    }
  }

  getChatSession(req, res) {
    try {
      const session = this.sessionsRepo.findById(req.params.sessionId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }
      return this.sendJson(res, session.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to load chat session');
    }
  }

  deleteChatSession(req, res) {
    try {
      const deleted = this.sessionsRepo.deleteById(req.params.sessionId);
      if (!deleted) {
        throw new NotFoundError('Chat session not found');
      }
      return this.sendJson(res, { success: true, deletedId: req.params.sessionId });
    } catch (error) {
      return this.handleError(res, error, 'Failed to delete chat session');
    }
  }

  updateChatMessage(req, res) {
    try {
      const { sessionId, messageId } = req.params;
      const { content, selectedVariantIndex, isPinned, rating } = req.body;

      const session = this.sessionsRepo.findById(sessionId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }

      const msg = session.messages.find(m => m.id === messageId);
      if (!msg) {
        throw new NotFoundError('Message not found');
      }

      if (typeof selectedVariantIndex === 'number') {
        msg.selectVariant(selectedVariantIndex);
      }
      if (typeof content === 'string' && content.trim()) {
        msg.updateContent(content);
      }
      if (typeof isPinned === 'boolean') {
        msg.isPinned = isPinned;
      }
      if (typeof rating === 'number' && rating >= 0 && rating <= 4) {
        msg.rating = rating;
      }

      session.touch();
      this.sessionsRepo.save(session);

      return this.sendJson(res, {
        message: msg.toJSON(),
        session: session.toJSON()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to update message');
    }
  }

  rewindChatSession(req, res) {
    try {
      const { sessionId } = req.params;
      const { messageId } = req.body;

      const session = this.sessionsRepo.findById(sessionId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }

      if (!session.rewindToMessage(messageId)) {
        throw new NotFoundError('Target message not found in session');
      }

      this.sessionsRepo.save(session);
      return this.sendJson(res, session.toJSON());
    } catch (error) {
      return this.handleError(res, error, 'Failed to rewind chat session');
    }
  }

  async sendChatMessage(req, res) {
    try {
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

      const character = this.charsRepo.findById(charId);
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
        this.charsRepo.save(character);
        return this.sendJson(res, {
          response: feedback,
          characterUpdated: character.toJSON()
        });
      }

      // Load or create ChatSession entity
      let session = sessionId ? this.sessionsRepo.findById(sessionId) : null;
      if (!session) {
        const existingForChar = this.sessionsRepo.findAll(charId);
        session = existingForChar[0] || null;
      }

      const activePersona =
        (personaId && this.personasRepo.findById(personaId)) ||
        (session?.personaId && this.personasRepo.findById(session.personaId)) ||
        this.personasRepo.findDefault();

      if (!session) {
        session = this.#createNewSessionEntity(
          character,
          activePersona ? activePersona.id : 'persona_default',
          provider || config.AI_PROVIDER
        );
      }

      if (personaId) session.personaId = personaId;
      if (provider) session.provider = provider;

      const pinnedMessages = session.getPinnedMessages().map(m => m.toJSON());
      const effectiveHistory = Array.isArray(clientMemory) && clientMemory.length > 0
        ? clientMemory.slice(-config.MAX_MEMORY_MESSAGES)
        : session.messages
            .slice(-config.MAX_MEMORY_MESSAGES)
            .map(m => ({ role: m.role, content: m.content }));

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
        const precedingUserMsg = lastModelIdx > 0 && sessionMsgs[lastModelIdx - 1].role === 'user'
          ? sessionMsgs[lastModelIdx - 1].content
          : (message || 'Continue roleplay');

        const existingVariants = Array.isArray(excludeVariants) && excludeVariants.length > 0
          ? excludeVariants
          : (targetModelMsg ? targetModelMsg.variants.map(v => v.text) : (previousResponse ? [previousResponse] : []));

        const historyBeforeLastModel = lastModelIdx > 0
          ? sessionMsgs.slice(0, lastModelIdx - 1).slice(-config.MAX_MEMORY_MESSAGES).map(m => ({ role: m.role, content: m.content }))
          : effectiveHistory.slice(0, -1);

        const regeneratePrompt = `Generate a fresh, distinct alternative reply to this user message:
"${precedingUserMsg}"

Rules:
- Use different wording, actions, and angle while staying completely in character as ${character.name}
- Keep the light-novel formatting (*italic actions* and ${character.name}: "Dialogue")
${existingVariants.length > 0 ? `- Do NOT repeat these previous variants:\n${existingVariants.map(v => `  * "${v.slice(0, 140)}"`).join('\n')}` : ''}`;

        const reply = await this.orchestrator.chat(character.toJSON(), regeneratePrompt, historyBeforeLastModel, aiOptions);

        if (targetModelMsg) {
          targetModelMsg.addVariant(reply);
        }
        session.touch();
        this.sessionsRepo.save(session);

        return this.sendJson(res, {
          response: reply || 'AI did not respond',
          regenerated: true,
          sessionId: session.id,
          message: targetModelMsg ? targetModelMsg.toJSON() : null
        });
      }

      // Case 2: Scene Continuation
      if (isContinue) {
        const anchorMsg = lastMessage ||
          (session.messages.length > 0 ? session.messages[session.messages.length - 1].content : '');

        const continuationPrompt = continueFromAssistant
          ? `Continue the roleplay scene naturally from your previous message below.
Do not restart the conversation. Do not speak or act as the user. Advance the moment with a new action or line of dialogue in light-novel style.

Your previous message:
"""
${anchorMsg}
"""`
          : `Continue the conversation naturally based on your last reply without repeating yourself. Write in light-novel style as ${character.name}.

Your last reply: "${anchorMsg}"`;

        const reply = await this.orchestrator.chat(character.toJSON(), continuationPrompt, effectiveHistory, aiOptions);

        const newAiMsg = session.addMessage({
          role: 'model',
          content: reply
        });
        this.sessionsRepo.save(session);

        character.incrementInteractions();
        this.charsRepo.save(character);

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

      this.sessionsRepo.save(session);

      character.incrementInteractions();
      this.charsRepo.save(character);

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

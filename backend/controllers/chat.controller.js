import { appraisalService } from '../services/appraisal.service.js';
import { snapshot, prepareNarrativeState, narrativeContext } from '../services/turn-state.js';
import { RELATIONSHIP_MOODS, normalizeRelationshipStage } from '../../frontend/js/relationship-contract.js';
import { BaseController } from './BaseController.js';
import { ChatSession, ChatMessage } from '../models/ChatSession.js';
import {
  characterRepository,
  chatSessionRepository,
  personaRepository
} from '../repositories/index.js';
import { aiOrchestrator } from '../ai/index.js';
import { memoryService } from '../services/memory.service.js';
import { relationshipService, createStreamTailFilter } from '../services/relationship.service.js';
import { generateDefaultGreeting } from '../ai/prompt/characterPrompt.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';
import { config } from '../config/index.js';
import { normalizeProviderName, resolveStoredProviderName } from '../ai/providerSelection.js';

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
    orchestrator = aiOrchestrator,
    relService = relationshipService,
    appraiser = appraisalService
  ) {
    super();
    this.sessionsRepo = sessionsRepo;
    this.charsRepo = charsRepo;
    this.personasRepo = personasRepo;
    this.memoryService = memService;
    this.orchestrator = orchestrator;
    this.relationshipService = relService;
    this.appraiser = appraiser;

    this.getChatSessions = this.getChatSessions.bind(this);
    this.createChatSession = this.createChatSession.bind(this);
    this.getChatSession = this.getChatSession.bind(this);
    this.deleteChatSession = this.deleteChatSession.bind(this);
    this.updateChatMessage = this.updateChatMessage.bind(this);
    this.rewindChatSession = this.rewindChatSession.bind(this);
    this.sendChatMessage = this.sendChatMessage.bind(this);
    this.updateSessionRelationship = this.updateSessionRelationship.bind(this);
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
      provider: provider || config.AI_PROVIDER || 'gemini',
      affinity: character.initialAffinity ?? 0,
      trust: character.initialAffinity ?? 0,
      strain: 0,
      relationshipStage: character.initialRelationshipStage || 'Stranger / Neutral',
      relationshipMood: 'Calm'
    });

    session.addMessage(new ChatMessage({
      sessionId: session.id,
      role: 'model',
      content: greetingText,
      position: 0
    }));

    session.pendingEvent = { kind: 'initial', position: 0, messageId: session.messages[0].id, before: snapshot(session) };
    return session;
  }

  /**
   * Non-blocking background scheduler for post-turn metrics, memory detection and story summarization
   */
  #schedulePostTurnTasks({ userText, aiText, character, session }) {
    character.incrementInteractions();
    this.charsRepo.incrementInteractions(character.id, character.updatedAt).catch(err => {
      console.warn('[CHAT CONTROLLER] Failed to increment interactions:', err.message);
    });

    setImmediate(() => {
      if (aiText && !session.narrativeState?.version) {
        this.memoryService.detectAndStoreFromTurn(userText, aiText, character.id, session.id).catch(err => {
          console.warn('[CHAT CONTROLLER] Background memory extraction warning:', err.message);
        });
      }

      if (session.messages.length >= 24) {
        this.memoryService.updateRollingStorySummary(session, character).catch(err => {
          console.warn('[CHAT CONTROLLER] Background rolling summary warning:', err.message);
        });
      }
    });
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
      const rows = await this.sessionsRepo.findAllLean(characterId || null, userId);

      const enriched = rows.map(row => {
        const char = charMap.get(row.character_id);
        return {
          id: row.id,
          userId: row.user_id,
          characterId: row.character_id,
          characterName: char ? char.name : 'Unknown Character',
          characterAvatar: char ? char.avatar : '',
          characterTagline: char ? char.tagline : '',
          personaId: row.persona_id,
          title: row.title || (char ? `Chat with ${char.name}` : 'Chat'),
          provider: row.provider,
          affinity: Number(row.affinity ?? 0),
          trust: Number(row.trust ?? row.affinity ?? 0),
          strain: Number(row.strain ?? 0),
          relationshipStage: row.relationship_stage || 'Stranger / Neutral',
          relationshipMood: row.relationship_mood || 'Calm',
          messageCount: Number(row.message_count) || 0,
          lastMessage: row.last_message || '',
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      });

      return this.sendJson(res, enriched);
    } catch (error) {
      return this.handleError(res, error, 'Failed to list chat sessions');
    }
  }

  async createChatSession(req, res) {
    try {
      const { characterId, personaId, provider: requestedProvider, title } = req.body;
      const provider = normalizeProviderName(requestedProvider);
      const userId = req.user ? req.user.id : null;
      if (!characterId) {
        throw new ValidationError('characterId is required', 'characterId');
      }

      const [character, activePersona] = await Promise.all([
        this.charsRepo.findById(characterId),
        personaId
          ? this.personasRepo.findById(personaId, userId)
          : this.personasRepo.findDefault(userId)
      ]);

      if (!character) {
        throw new NotFoundError('Character not found');
      }

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
      if ('content' in updateFields) {
        const position = session.messages.indexOf(msg);
        await this.sessionsRepo.restoreStateAt(session, msg.role === 'user' ? position - 1 : position);
      }
      await this.sessionsRepo.updateMessageFields(sessionId, messageId, updateFields, session);

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

      await this.sessionsRepo.restoreStateAt(session, session.messages.length - 1);
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
        messageId,
        personaId,
        provider: requestedProvider,
        message,
        memory: clientMemory,
        regenerate,
        previousResponse,
        continue: isContinue,
        lastMessage,
        excludeVariants,
        continueFromAssistant
      } = req.body;

      const provider = requestedProvider === undefined ? undefined : normalizeProviderName(requestedProvider);

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
        if (typeof message !== 'string' || !message.trim()) {
          throw new ValidationError('Message is required', 'message');
        }
      }

      if (message && message.length > config.MAX_MESSAGE_LENGTH) {
        throw new ValidationError(`Message too long (max ${config.MAX_MESSAGE_LENGTH} characters)`, 'message');
      }

      const [character, sessionLookup, preloadedPersona] = await Promise.all([
        this.charsRepo.findById(charId),
        sessionId
          ? this.sessionsRepo.findById(sessionId, userId)
          : (userId ? this.sessionsRepo.findAll(charId, userId).then(arr => arr[0] || null) : Promise.resolve(null)),
        personaId
          ? this.personasRepo.findById(personaId, userId)
          : this.personasRepo.findDefault(userId)
      ]);

      if (!character) {
        throw new ValidationError('Character not found', 'charId');
      }

      // Handle in-chat /update command via Character OOP domain method
      if (message && message.trim().startsWith('/update ')) {
        if (!character.canModify(req.user)) {
          return this.sendError(res, 'Only the character creator or an admin can modify this character via /update', 403);
        }

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

      if (sessionId && !sessionLookup) throw new NotFoundError('Chat session not found');
      if (sessionLookup && sessionLookup.characterId !== charId) throw new ValidationError('Session belongs to a different character', 'charId');
      let session = sessionLookup;
      let activePersona = preloadedPersona;
      if (!activePersona && session?.personaId) {
        activePersona = await this.personasRepo.findById(session.personaId, userId);
      }
      if (!activePersona) {
        activePersona = await this.personasRepo.findDefault(userId);
      }

      let isNewSession = false;
      if (!session) {
        session = this.#createNewSessionEntity(
          character,
          activePersona ? activePersona.id : 'persona_default',
          provider || config.AI_PROVIDER,
          '',
          userId
        );
        isNewSession = true;
      }

      if (personaId) session.personaId = personaId;
      if (provider) session.provider = provider;

      const pinnedMessages = session.getPinnedMessages().map(m => m.toJSON());
      const effectiveHistory = isNewSession && Array.isArray(clientMemory) && clientMemory.length > 0
        ? clientMemory.slice(-config.MAX_MEMORY_MESSAGES)
        : session.messages
            .slice(-config.MAX_MEMORY_MESSAGES)
            .map(m => ({
              role: m.role,
              content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
            }));

      const lastHistoryText = effectiveHistory.length > 0
        ? effectiveHistory[effectiveHistory.length - 1].content || ''
        : '';
      const rawQueryText = (message || lastMessage || '').trim();
      const queryForMemory = (rawQueryText.length > 0 && rawQueryText.length < 30 && lastHistoryText)
        ? `${lastHistoryText.slice(-200)} ${rawQueryText}`
        : (rawQueryText || lastHistoryText.slice(-200) || character.name);
      const [relevantMemories, storySummary] = await Promise.all([
        this.memoryService.retrieveRelevantMemories(
          queryForMemory,
          charId,
          4,
          session ? session.id : null
        ),
        session
          ? this.memoryService.getSessionStorySummary(session.id)
          : Promise.resolve('')
      ]);

      const beforeState = snapshot(session);
      const context = narrativeContext(session, queryForMemory);
      const appraisal = !regenerate && !isContinue
        ? await this.appraiser.appraise({ character, session, userText: message.trim(), history: effectiveHistory, memories: context.memories })
        : null;
      const evaluatedState = this.relationshipService.evaluateAppraisal({userText:message || '',session,character,appraisal});
      const aiOptions = {
        requireComplete: true,
        appraisalManaged: true,
        narrativeContext: {...context,scene:appraisal?.scene || context.scene},
        appraisal,
        provider: provider ?? resolveStoredProviderName(session.provider),
        persona: activePersona ? activePersona.toJSON() : null,
        pinnedMessages,
        memories: relevantMemories,
        storySummary,
        relationship: {
          affinity: evaluatedState.affinity,
          trust: evaluatedState.trust,
          strain: evaluatedState.strain,
          stage: evaluatedState.relationshipStage,
          mood: evaluatedState.relationshipMood,
          dynamic: character.relationshipDynamic
        }
      };

      // Case 1: Regenerate Swipe Variant
      if (regenerate) {
        const sessionMsgs = session.messages;
        const targetModelIdx = messageId
          ? sessionMsgs.findIndex(m => m.id === messageId)
          : sessionMsgs.map(m => m.role).lastIndexOf('model');
        const targetModelMsg = targetModelIdx !== -1 ? sessionMsgs[targetModelIdx] : null;
        if (!targetModelMsg || targetModelMsg.role !== 'model') {
          throw new ValidationError('No character message found to regenerate', 'regenerate');
        }

        if (targetModelIdx !== sessionMsgs.length - 1) throw new ValidationError('Rewind to this message before regenerating it', 'messageId');
        const isContinuationTurn = Boolean(req.body.isContinuation) ||
          (targetModelIdx > 0 && sessionMsgs[targetModelIdx - 1].role === 'model');

        const rawVariants = Array.isArray(excludeVariants) && excludeVariants.length > 0
          ? excludeVariants
          : (targetModelMsg ? targetModelMsg.variants.map(v => v.text) : (previousResponse ? [previousResponse] : []));

        // Filter out fallback texts and only keep at most the last 3 clean snippets
        const existingVariants = rawVariants
          .filter(t =>
            t &&
            typeof t === 'string' &&
            !t.includes('Directive') &&
            !t.includes('pauses thoughtfully') &&
            !t.includes('gather my thoughts') &&
            !t.includes('Generate a fresh, distinct alternative reply')
          )
          .slice(-3);

        const userName = activePersona ? activePersona.name : 'the user';
        let reply;

        const regenOptions = {
          ...aiOptions,
          isRegenerate: true,
          isContinuation: isContinuationTurn,
          excludeVariants: existingVariants
        };

        if (isContinuationTurn) {
          const anchorMsg = targetModelIdx > 0
            ? ((sessionMsgs[targetModelIdx - 1].variants &&
                sessionMsgs[targetModelIdx - 1].variants[sessionMsgs[targetModelIdx - 1].selectedVariantIndex]?.text) ||
               sessionMsgs[targetModelIdx - 1].content)
            : (lastMessage || '');

          // Keep all previous turns including the anchor character turn right before this continuation
          const historyBeforeContinuation = sessionMsgs
            .slice(0, targetModelIdx)
            .slice(-config.MAX_MEMORY_MESSAGES)
            .map(m => ({
              role: m.role,
              content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
            }));

          const regeneratePrompt = `Continue the scene naturally from your perspective as ${character.name}.
Advance the moment forward from your previous message below with a fresh, distinct action, movement, quiet reflection, or spoken line:
"""
${anchorMsg}
"""

Rules:
- Write in light-novel style (*italic narration/actions*, ${character.name}: "Dialogue").
${existingVariants.length > 0 ? `- Do NOT repeat previous takes:\n${existingVariants.map(v => `  * "${v.slice(0, 100)}"`).join('\n')}` : ''}
- Only speak and act as ${character.name}.`;

          reply = await this.orchestrator.chat(character.toJSON(), regeneratePrompt, historyBeforeContinuation, regenOptions);
        } else {
          const precedingUserMsg = targetModelIdx > 0 && sessionMsgs[targetModelIdx - 1].role === 'user'
            ? ((sessionMsgs[targetModelIdx - 1].variants &&
                sessionMsgs[targetModelIdx - 1].variants[sessionMsgs[targetModelIdx - 1].selectedVariantIndex]?.text) ||
               sessionMsgs[targetModelIdx - 1].content)
            : (message || 'Continue roleplay');

          const historyBeforeLastModel = targetModelIdx > 0
            ? sessionMsgs.slice(0, targetModelIdx - 1).slice(-config.MAX_MEMORY_MESSAGES).map(m => ({
                role: m.role,
                content: (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content
              }))
            : effectiveHistory.slice(0, -1);

          reply = await this.orchestrator.chat(character.toJSON(), precedingUserMsg, historyBeforeLastModel, regenOptions);
        }

        const { cleanText, llmState } = this.relationshipService.extractAndStripStateTag(reply);

        let newVar = null;
        if (targetModelMsg) {
          newVar = targetModelMsg.addVariant(cleanText);
        }
        session.touch();

        // Alternate wording reuses the same appraisal and never earns relationship points.
        if (!cleanText.trim()) throw new Error('Empty character response');

        if (targetModelMsg && newVar) {
          await this.sessionsRepo.appendVariant(session, targetModelMsg, newVar);
        } else {
          await this.sessionsRepo.save(session);
        }

        return this.sendJson(res, {
          response: cleanText || 'AI did not respond',
          regenerated: true,
          sessionId: session.id,
          message: targetModelMsg ? targetModelMsg.toJSON() : null,
          relationship: {
            affinity: session.affinity,
            trust: session.trust,
            strain: session.strain,
            relationshipStage: session.relationshipStage,
            relationshipMood: session.relationshipMood
          }
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
        const continuationPrompt = `Continue the scene naturally from your perspective as ${character.name}.
Advance the moment forward from your previous message below: describe your character's next physical movement, expression, quiet thoughts, or ongoing dialogue.
Maintain natural continuity with what you just said or did in your previous message:
"""
${anchorMsg}
"""

Rules:
- Write in light-novel style with *italicized narration/actions* and dialogue formatted as ${character.name}: "Dialogue".
- Do not repeat your previous words. Only speak and act as ${character.name}.`;

        const rawReply = await this.orchestrator.chat(character.toJSON(), continuationPrompt, effectiveHistory, aiOptions);
        const { cleanText } = this.relationshipService.extractAndStripStateTag(rawReply);

        if (!cleanText.trim()) throw new Error('Empty character response');
        const newAiMsg = session.addMessage({
          role: 'model',
          content: cleanText
        });
        session.touch();
        session.pendingEvent = {kind:'continuation',position:session.messages.length-1,messageId:newAiMsg.id,before:beforeState};
        await this.sessionsRepo.appendMessages(session, isNewSession ? session.messages : [newAiMsg]);

        this.#schedulePostTurnTasks({ userText: '', aiText: cleanText, character, session });

        return this.sendJson(res, {
          response: cleanText || 'AI did not respond',
          continuation: true,
          sessionId: session.id,
          message: newAiMsg.toJSON(),
          relationship: {
            affinity: session.affinity,
            trust: session.trust,
            strain: session.strain,
            relationshipStage: session.relationshipStage,
            relationshipMood: session.relationshipMood
          }
        });
      }

      // Case 3: Standard User Chat Turn
      const isStreaming = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

      const commitState = (userMsgObj, aiMsgObj) => {
        Object.assign(session, evaluatedState);
        session.narrativeState = prepareNarrativeState(session, appraisal, userMsgObj);
        session.narrativeState.version = 1;
        session.narrativeState.appraisalStatus = appraisal ? 'verified' : 'unavailable';
        if (appraisal) {
          const signed = n=>n>0?`+${n}`:String(n);
          session.narrativeState.lastChange += ` Bond ${signed(session.affinity-beforeState.affinity)}; trust ${signed(session.trust-beforeState.trust)}; strain ${signed(session.strain-beforeState.strain)}.`;
        }
        session.pendingEvent = {kind:'turn',position:session.messages.length-1,messageId:aiMsgObj.id,before:beforeState};
        return {...evaluatedState,changeReason:session.narrativeState.lastChange,emotionIntensity:session.narrativeState.emotion?.intensity};
      };

      if (isStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const userMsgObj = session.addMessage({
          role: 'user',
          content: message.trim()
        });

        let fullReply = '';
        const tailFilter = createStreamTailFilter((safeChunk) => {
          res.write(`data: ${JSON.stringify({ token: safeChunk })}\n\n`);
        });

        try {
          for await (const chunk of this.orchestrator.chatStream(character.toJSON(), message.trim(), effectiveHistory, aiOptions)) {
            fullReply += chunk;
            tailFilter.push(chunk);
          }
          tailFilter.flush();
        } catch (streamErr) {
          console.warn('[CHAT CONTROLLER] Streaming fallback:', streamErr.message);
          if (fullReply) throw streamErr;
          if (!fullReply) {
            fullReply = await this.orchestrator.chat(character.toJSON(), message.trim(), effectiveHistory, aiOptions);
            const { cleanText: fallbackClean } = this.relationshipService.extractAndStripStateTag(fullReply);
            res.write(`data: ${JSON.stringify({ token: fallbackClean })}\n\n`);
          }
        }

        const { cleanText, llmState } = this.relationshipService.extractAndStripStateTag(fullReply);

        if (!cleanText.trim()) throw new Error("Empty character response");

        const aiMsgObj = session.addMessage({
          role: 'model',
          content: cleanText || '...'
        });
        session.touch();

        const newRelState = commitState(userMsgObj, aiMsgObj);
        const newlyAdded = isNewSession ? session.messages : [userMsgObj, aiMsgObj];
        await this.sessionsRepo.appendMessages(session, newlyAdded);

        this.#schedulePostTurnTasks({ userText: message, aiText: cleanText, character, session });

        res.write(`data: ${JSON.stringify({
          done: true,
          sessionId: session.id,
          userMessage: userMsgObj.toJSON(),
          aiMessage: aiMsgObj.toJSON(),
          response: cleanText,
          relationship: newRelState
        })}\n\n`);
        return res.end();
      }

      const userMsgObj = session.addMessage({
        role: 'user',
        content: message.trim()
      });

      const rawReply = await this.orchestrator.chat(character.toJSON(), message.trim(), effectiveHistory, aiOptions);
      const { cleanText, llmState } = this.relationshipService.extractAndStripStateTag(rawReply);

      if (!cleanText.trim()) throw new Error("Empty character response");

      const aiMsgObj = session.addMessage({
        role: 'model',
        content: cleanText
      });
      session.touch();

      const newRelState = commitState(userMsgObj, aiMsgObj);
      const newlyAdded = isNewSession ? session.messages : [userMsgObj, aiMsgObj];
      await this.sessionsRepo.appendMessages(session, newlyAdded);

      this.#schedulePostTurnTasks({ userText: message, aiText: cleanText, character, session });

      return this.sendJson(res, {
        response: cleanText || 'AI did not respond',
        sessionId: session.id,
        userMessage: userMsgObj.toJSON(),
        aiMessage: aiMsgObj.toJSON(),
        memoriesUsed: relevantMemories.length + context.memories.length,
        relationship: newRelState
      });
    } catch (error) {
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({error: 'Turn could not be saved. Reload the conversation before retrying.'})}\n\n`);
        return res.end();
      }
      return this.handleError(res, error, 'Chat service temporarily unavailable');
    }
  }

  async updateSessionRelationship(req, res) {
    try {
      const { sessionId } = req.params;
      const userId = req.user ? req.user.id : null;
      const { affinity, trust, strain, relationshipStage, relationshipMood } = req.body;

      const session = await this.sessionsRepo.findById(sessionId, userId);
      if (!session) {
        throw new NotFoundError('Chat session not found');
      }

      for (const value of [affinity, trust, strain]) if (value !== undefined && !Number.isFinite(value)) throw new ValidationError('Relationship scores must be finite numbers');
      if (relationshipStage !== undefined && typeof relationshipStage !== 'string') throw new ValidationError('Relationship stage must be a string');
      if (relationshipMood !== undefined && typeof relationshipMood !== 'string') throw new ValidationError('Relationship mood must be a string');
      if (relationshipMood && !RELATIONSHIP_MOODS.includes(relationshipMood)) throw new ValidationError('Unknown relationship mood');
      if (relationshipStage && normalizeRelationshipStage(relationshipStage)==='Stranger / Neutral' && relationshipStage!=='Stranger / Neutral') throw new ValidationError('Unknown relationship stage');
      const before = snapshot(session);
      const targetAffinity = typeof affinity === 'number' ? Math.max(-100, Math.min(100, affinity)) : session.affinity;
      const targetTrust = typeof trust === 'number' ? Math.max(-100, Math.min(100, trust)) : session.trust;
      const targetStrain = typeof strain === 'number' ? Math.max(0, Math.min(100, strain)) : session.strain;
      const targetMood = typeof relationshipMood === 'string' && relationshipMood.trim() ? relationshipMood.trim() : session.relationshipMood;

      let targetStage = typeof relationshipStage === 'string' && relationshipStage.trim() ? normalizeRelationshipStage(relationshipStage.trim()) : null;
      if (!targetStage) {
        const character = await this.charsRepo.findById(session.characterId);
        targetStage = this.relationshipService.resolveStage({
          affinity: targetAffinity,
          trust: targetTrust,
          strain: targetStrain,
          mood: targetMood,
          character: character || {},
          currentStage: session.relationshipStage
        });
      }

      const updatedState = {
        affinity: targetAffinity,
        trust: targetTrust,
        strain: targetStrain,
        relationshipStage: targetStage,
        relationshipMood: targetMood
      };

      Object.assign(session, updatedState);
      session.narrativeState = {...session.narrativeState,lastChange:'Relationship adjusted by Director.',emotion:{mood:targetMood,intensity:0.5,cause:'Director override'}};
      session.pendingEvent = {kind:'director',position:Math.max(0,session.messages.length-1),messageId:session.messages.at(-1)?.id || null,before};
      await this.sessionsRepo.updateRelationshipState(sessionId, updatedState, session);

      return this.sendJson(res, {
        success: true,
        relationship: updatedState,
        session: session.toJSON()
      });
    } catch (error) {
      return this.handleError(res, error, 'Failed to update relationship state');
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
  sendChatMessage,
  updateSessionRelationship
} = chatController;

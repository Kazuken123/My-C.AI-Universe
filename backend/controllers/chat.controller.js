import { chatWithAI } from '../ai/index.js';
import { compileCharacterSystemPrompt, generateDefaultGreeting } from '../ai/prompt/characterPrompt.js';
import { ValidationError, NotFoundError } from '../ai/errors.js';
import { config } from '../config/index.js';
import { storage } from '../services/storage.service.js';
import { memoryService } from '../services/memory.service.js';

/**
 * Helper to create a new session object initialized with the character's greeting
 */
function buildNewSessionObject(character, personaId = null, provider = 'gemini', title = '') {
  const now = new Date().toISOString();
  const greetingText = generateDefaultGreeting(character);
  const greetingMsgId = `msg_${Date.now()}_greeting`;

  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    characterId: character.id,
    personaId: personaId || 'persona_default',
    title: title || `Chat with ${character.name}`,
    provider: provider || config.AI_PROVIDER || 'gemini',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: greetingMsgId,
        role: 'model',
        content: greetingText,
        selectedVariantIndex: 0,
        isPinned: false,
        rating: 0,
        createdAt: now,
        variants: [
          {
            id: `${greetingMsgId}_v1`,
            text: greetingText,
            createdAt: now
          }
        ]
      }
    ]
  };
}

/**
 * List all chat sessions (optionally filtered by ?characterId=)
 */
export function getChatSessions(req, res) {
  try {
    const { characterId } = req.query;
    const characters = storage.getCharacters();
    const charMap = new Map(characters.map(c => [c.id, c]));

    let chats = storage.getChats();
    if (characterId) {
      chats = chats.filter(c => c.characterId === characterId);
    }

    const enriched = chats
      .map(chat => {
        const char = charMap.get(chat.characterId);
        const lastMsg = chat.messages && chat.messages.length > 0
          ? chat.messages[chat.messages.length - 1]
          : null;
        return {
          id: chat.id,
          characterId: chat.characterId,
          characterName: char ? char.name : 'Unknown Character',
          characterAvatar: char ? char.avatar : '',
          characterTagline: char ? char.tagline : '',
          personaId: chat.personaId,
          title: chat.title || (char ? `Chat with ${char.name}` : 'Chat'),
          provider: chat.provider || 'gemini',
          messageCount: chat.messages ? chat.messages.length : 0,
          lastMessage: lastMsg ? lastMsg.content : '',
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt
        };
      })
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.json(enriched);
  } catch (error) {
    console.error('[CHAT] Error listing chat sessions:', error);
    res.status(500).json({
      error: { message: 'Failed to list chat sessions', code: 500 }
    });
  }
}

/**
 * Create a new chat session for a character
 */
export function createChatSession(req, res) {
  try {
    const { characterId, personaId, provider, title } = req.body;
    if (!characterId) {
      throw new ValidationError('characterId is required', 'characterId');
    }

    const characters = storage.getCharacters();
    const character = characters.find(c => c.id === characterId);
    if (!character) {
      throw new NotFoundError('Character not found');
    }

    const personas = storage.getPersonas();
    const activePersona = personas.find(p => p.id === personaId) || personas.find(p => p.isDefault) || personas[0];

    const session = buildNewSessionObject(
      character,
      activePersona ? activePersona.id : 'persona_default',
      provider,
      title
    );

    const chats = storage.getChats();
    chats.unshift(session);
    storage.saveChats(chats);

    res.status(201).json(session);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to create chat session', code }
    });
  }
}

/**
 * Get a specific chat session by ID
 */
export function getChatSession(req, res) {
  try {
    const { sessionId } = req.params;
    const chats = storage.getChats();
    const session = chats.find(c => c.id === sessionId);

    if (!session) {
      throw new NotFoundError('Chat session not found');
    }

    res.json(session);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to load chat session', code }
    });
  }
}

/**
 * Delete a chat session by ID
 */
export function deleteChatSession(req, res) {
  try {
    const { sessionId } = req.params;
    const chats = storage.getChats();
    const filtered = chats.filter(c => c.id !== sessionId);

    if (filtered.length === chats.length) {
      throw new NotFoundError('Chat session not found');
    }

    storage.saveChats(filtered);
    res.json({ success: true, deletedId: sessionId });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to delete chat session', code }
    });
  }
}

/**
 * Update a specific message inside a chat session (edit content, switch variant, pin, rate)
 */
export function updateChatMessage(req, res) {
  try {
    const { sessionId, messageId } = req.params;
    const { content, selectedVariantIndex, isPinned, rating } = req.body;

    const chats = storage.getChats();
    const session = chats.find(c => c.id === sessionId);
    if (!session) {
      throw new NotFoundError('Chat session not found');
    }

    const msg = session.messages.find(m => m.id === messageId);
    if (!msg) {
      throw new NotFoundError('Message not found');
    }

    if (typeof selectedVariantIndex === 'number' && Array.isArray(msg.variants)) {
      if (selectedVariantIndex >= 0 && selectedVariantIndex < msg.variants.length) {
        msg.selectedVariantIndex = selectedVariantIndex;
        msg.content = msg.variants[selectedVariantIndex].text;
      }
    }

    if (typeof content === 'string' && content.trim()) {
      msg.content = content.trim();
      if (Array.isArray(msg.variants) && msg.variants[msg.selectedVariantIndex || 0]) {
        msg.variants[msg.selectedVariantIndex || 0].text = msg.content;
      }
    }

    if (typeof isPinned === 'boolean') {
      msg.isPinned = isPinned;
    }

    if (typeof rating === 'number' && rating >= 0 && rating <= 4) {
      msg.rating = rating;
    }

    session.updatedAt = new Date().toISOString();
    storage.saveChats(chats);

    res.json({ message: msg, session });
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to update message', code }
    });
  }
}

/**
 * Rewind a chat session to a specific message ID (deletes all messages after it)
 */
export function rewindChatSession(req, res) {
  try {
    const { sessionId } = req.params;
    const { messageId } = req.body;

    const chats = storage.getChats();
    const session = chats.find(c => c.id === sessionId);
    if (!session) {
      throw new NotFoundError('Chat session not found');
    }

    const idx = session.messages.findIndex(m => m.id === messageId);
    if (idx === -1) {
      throw new NotFoundError('Target message not found in session');
    }

    session.messages = session.messages.slice(0, idx + 1);
    session.updatedAt = new Date().toISOString();
    storage.saveChats(chats);

    res.json(session);
  } catch (error) {
    const code = error.code || 500;
    res.status(code).json({
      error: { message: error.message || 'Failed to rewind chat session', code }
    });
  }
}

/**
 * Send a chat message, regenerate a variant, or continue the roleplay scene
 */
export async function sendChatMessage(req, res) {
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

    // Load character
    const chars = storage.getCharacters();
    const charIndex = chars.findIndex(x => x.id === charId);
    if (charIndex === -1) {
      throw new ValidationError('Character not found', 'charId');
    }
    const character = chars[charIndex];

    // Handle in-chat /update command
    if (message && message.trim().startsWith('/update ')) {
      const result = handleUpdateCommand(message.trim(), character);
      chars[charIndex] = character;
      storage.saveCharacters(chars);
      return res.json({ response: result, characterUpdated: character });
    }

    // Load or create persistent chat session
    const chats = storage.getChats();
    let session = sessionId ? chats.find(c => c.id === sessionId) : chats.find(c => c.characterId === charId);
    const personas = storage.getPersonas();
    const activePersona =
      personas.find(p => p.id === (personaId || session?.personaId)) ||
      personas.find(p => p.isDefault) ||
      personas[0] ||
      null;

    if (!session) {
      session = buildNewSessionObject(
        character,
        activePersona ? activePersona.id : 'persona_default',
        provider || config.AI_PROVIDER
      );
      chats.unshift(session);
    }

    if (personaId) session.personaId = personaId;
    if (provider) session.provider = provider;

    // Build conversation history and pinned messages from session or client memory
    const pinnedMessages = (session.messages || []).filter(m => m.isPinned);
    const effectiveHistory = Array.isArray(clientMemory) && clientMemory.length > 0
      ? clientMemory.slice(-config.MAX_MEMORY_MESSAGES)
      : (session.messages || [])
          .slice(-config.MAX_MEMORY_MESSAGES)
          .map(m => ({ role: m.role, content: m.content }));

    // Retrieve relevant long-term memories
    const queryForMemory = message || lastMessage || character.name;
    const relevantMemories = await memoryService.retrieveRelevantMemories(queryForMemory, charId, 4);

    const aiOptions = {
      provider: provider || session.provider || config.AI_PROVIDER,
      persona: activePersona,
      pinnedMessages,
      memories: relevantMemories
    };

    let reply;
    const now = new Date().toISOString();

    if (regenerate) {
      // Determine original user prompt and existing variants
      const sessionMsgs = session.messages || [];
      const lastModelIdx = sessionMsgs.map(m => m.role).lastIndexOf('model');
      const targetModelMsg = lastModelIdx !== -1 ? sessionMsgs[lastModelIdx] : null;
      const precedingUserMsg = lastModelIdx > 0 && sessionMsgs[lastModelIdx - 1].role === 'user'
        ? sessionMsgs[lastModelIdx - 1].content
        : (message || 'Continue roleplay');

      const existingVariants = Array.isArray(excludeVariants) && excludeVariants.length > 0
        ? excludeVariants
        : (targetModelMsg && Array.isArray(targetModelMsg.variants)
            ? targetModelMsg.variants.map(v => v.text)
            : (previousResponse ? [previousResponse] : []));

      const historyBeforeLastModel = lastModelIdx > 0
        ? sessionMsgs.slice(0, lastModelIdx - 1).slice(-config.MAX_MEMORY_MESSAGES).map(m => ({ role: m.role, content: m.content }))
        : effectiveHistory.slice(0, -1);

      const regeneratePrompt = `Generate a fresh, distinct alternative reply to this user message:
"${precedingUserMsg}"

Rules:
- Use different wording, actions, and angle while staying completely in character as ${character.name}
- Keep the light-novel formatting (*italic actions* and ${character.name}: "Dialogue")
${existingVariants.length > 0 ? `- Do NOT repeat these previous variants:\n${existingVariants.map(v => `  * "${v.slice(0, 140)}"`).join('\n')}` : ''}`;

      reply = await chatWithAI(character, regeneratePrompt, historyBeforeLastModel, aiOptions);

      if (targetModelMsg) {
        if (!Array.isArray(targetModelMsg.variants)) {
          targetModelMsg.variants = [{ id: `${targetModelMsg.id}_v1`, text: targetModelMsg.content, createdAt: targetModelMsg.createdAt || now }];
        }
        const newVar = {
          id: `${targetModelMsg.id}_v${targetModelMsg.variants.length + 1}`,
          text: reply,
          createdAt: now
        };
        targetModelMsg.variants.push(newVar);
        targetModelMsg.selectedVariantIndex = targetModelMsg.variants.length - 1;
        targetModelMsg.content = reply;
      }

      session.updatedAt = now;
      storage.saveChats(chats);

      return res.json({
        response: reply || 'AI did not respond',
        regenerated: true,
        sessionId: session.id,
        message: targetModelMsg
      });
    }

    if (isContinue) {
      const anchorMsg = lastMessage ||
        (session.messages && session.messages.length > 0
          ? session.messages[session.messages.length - 1].content
          : '');

      const continuationPrompt = continueFromAssistant
        ? `Continue the roleplay scene naturally from your previous message below.
Do not restart the conversation. Do not speak or act as the user. Advance the moment with a new action or line of dialogue in light-novel style.

Your previous message:
"""
${anchorMsg}
"""`
        : `Continue the conversation naturally based on your last reply without repeating yourself. Write in light-novel style as ${character.name}.

Your last reply: "${anchorMsg}"`;

      reply = await chatWithAI(character, continuationPrompt, effectiveHistory, aiOptions);

      const contMsgId = `msg_${Date.now()}_ai`;
      const newAiMsg = {
        id: contMsgId,
        role: 'model',
        content: reply,
        selectedVariantIndex: 0,
        isPinned: false,
        rating: 0,
        createdAt: now,
        variants: [{ id: `${contMsgId}_v1`, text: reply, createdAt: now }]
      };

      session.messages.push(newAiMsg);
      session.updatedAt = now;
      storage.saveChats(chats);

      character.interactions = (character.interactions || 0) + 1;
      storage.saveCharacters(chars);

      return res.json({
        response: reply || 'AI did not respond',
        continuation: true,
        sessionId: session.id,
        message: newAiMsg
      });
    }

    // Standard user message turn
    const userMsgId = `msg_${Date.now()}_user`;
    const userMsgObj = {
      id: userMsgId,
      role: 'user',
      content: message.trim(),
      createdAt: now
    };

    reply = await chatWithAI(character, message.trim(), effectiveHistory, aiOptions);

    const aiMsgId = `msg_${Date.now() + 1}_ai`;
    const aiMsgObj = {
      id: aiMsgId,
      role: 'model',
      content: reply,
      selectedVariantIndex: 0,
      isPinned: false,
      rating: 0,
      createdAt: new Date().toISOString(),
      variants: [{ id: `${aiMsgId}_v1`, text: reply, createdAt: new Date().toISOString() }]
    };

    session.messages.push(userMsgObj, aiMsgObj);
    session.updatedAt = new Date().toISOString();
    storage.saveChats(chats);

    // Increment character interactions count
    character.interactions = (character.interactions || 0) + 1;
    storage.saveCharacters(chars);

    // Detect & store long-term memories asynchronously
    if (reply) {
      memoryService.detectAndStoreFromTurn(message, reply, charId, session.id);
    }

    res.json({
      response: reply || 'AI did not respond',
      sessionId: session.id,
      userMessage: userMsgObj,
      aiMessage: aiMsgObj,
      memoriesUsed: relevantMemories.length
    });
  } catch (error) {
    console.error('[CHAT] Error processing chat message:', error);

    if (error instanceof ValidationError) {
      return res.status(400).json({
        error: {
          message: error.message,
          field: error.field,
          code: 400
        }
      });
    }

    const code = error.code || 500;
    res.status(code).json({
      error: {
        message: error.message || 'Chat service temporarily unavailable',
        code
      }
    });
  }
}

/**
 * Handle in-chat /update field: value commands and recompile systemPrompt for ALL fields
 */
function handleUpdateCommand(message, character) {
  const updateCmd = message.substring(8).trim();

  if (!updateCmd) {
    throw new ValidationError('Invalid update command format. Use: /update field: value');
  }

  const colonIndex = updateCmd.indexOf(':');
  if (colonIndex === -1) {
    throw new ValidationError('Invalid update command. Use format: /update field: value');
  }

  const field = updateCmd.substring(0, colonIndex).trim().toLowerCase();
  const value = updateCmd.substring(colonIndex + 1).trim();

  const allowedFields = [
    'name', 'tagline', 'greeting', 'personality', 'appearance',
    'abilities', 'background', 'summary', 'speaking_style', 'initial_memory'
  ];

  if (!allowedFields.includes(field)) {
    throw new ValidationError(`Cannot update field '${field}'. Allowed fields: ${allowedFields.join(', ')}`);
  }

  character[field] = value;
  character.systemPrompt = compileCharacterSystemPrompt(character);
  character.updatedAt = new Date().toISOString();

  return `✅ Updated **${field}** to: *${value}*`;
}

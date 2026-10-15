import { memoryRepository } from '../repositories/index.js';
import { CharacterMemory } from '../models/CharacterMemory.js';
import { memoryClient } from '../ai/memory/memoryClient.js';
import { config } from '../config/index.js';

/**
 * SemanticMemoryService Class (OOP Service Layer)
 * Encapsulates hybrid TF-IDF / token cosine similarity and Python sentence-transformer memory retrieval.
 */
export class SemanticMemoryService {
  static STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'over', 'after', 'is', 'am', 'are', 'was',
    'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'it', 'its',
    'they', 'them', 'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who',
    'whom', 'how', 'when', 'where', 'why', 'just', 'very', 'too', 'also', 'so', 'than',
    'và', 'của', 'có', 'cho', 'với', 'trong', 'được', 'các', 'một', 'những', 'để', 'khi',
    'này', 'đó', 'từ', 'về', 'như', 'người', 'thì', 'ở', 'đã', 'sẽ', 'cũng', 'hay', 'nhưng',
    'tôi', 'mình', 'bạn', 'là'
  ]);

  constructor(repository = memoryRepository, pyClient = memoryClient) {
    this.repository = repository;
    this.pyClient = pyClient;
  }

  /**
   * Tokenize and normalize text into meaningful terms
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 2 && !SemanticMemoryService.STOP_WORDS.has(token));
  }

  /**
   * Compute cosine similarity + partial stem overlap between two strings
   */
  computeSimilarity(query, memoryText) {
    const qTokens = this.tokenize(query);
    const mTokens = this.tokenize(memoryText);
    if (qTokens.length === 0 || mTokens.length === 0) return 0.1;

    const qFreq = new Map();
    const mFreq = new Map();
    for (const t of qTokens) qFreq.set(t, (qFreq.get(t) || 0) + 1);
    for (const t of mTokens) mFreq.set(t, (mFreq.get(t) || 0) + 1);

    let dotProduct = 0;
    let qNorm = 0;
    let mNorm = 0;

    for (const [term, count] of qFreq.entries()) {
      qNorm += count * count;
      if (mFreq.has(term)) {
        dotProduct += count * mFreq.get(term);
      } else {
        for (const [mTerm, mCount] of mFreq.entries()) {
          if (mTerm.startsWith(term) || term.startsWith(mTerm)) {
            dotProduct += 0.6 * count * mCount;
          }
        }
      }
    }

    for (const count of mFreq.values()) {
      mNorm += count * count;
    }

    const denom = Math.sqrt(qNorm) * Math.sqrt(mNorm);
    return denom > 0 ? Math.min(1, dotProduct / denom) : 0;
  }

  /**
   * Get memories (optionally filtered by characterId)
   */
  async getMemories(characterId = null) {
    const rows = await this.repository.findAll(characterId);
    return rows.map(m => m.toJSON());
  }

  /**
   * Add a deduplicated memory to the SQL repository
   */
  async addMemory(content, characterId, source = 'conversation', sessionId = null) {
    if (!content || !content.trim() || !characterId) return null;
    const cleanContent = content.trim();

    const charMemories = await this.repository.findAll(characterId);
    const isDuplicate = charMemories.some(
      m => m.content.toLowerCase() === cleanContent.toLowerCase() ||
           this.computeSimilarity(cleanContent, m.content) > 0.85
    );
    if (isDuplicate) return null;

    const newMemory = new CharacterMemory({
      characterId,
      sessionId,
      content: cleanContent,
      source
    });

    await this.repository.save(newMemory);
    this.pyClient.addMemory(cleanContent, characterId, { source, sessionId }).catch(() => {});

    return newMemory.toJSON();
  }

  /**
   * Delete a memory by ID
   */
  async deleteMemory(memoryId) {
    return await this.repository.deleteById(memoryId);
  }

  /**
   * Retrieve top-K relevant memories scoped to character lore + active session
   */
  async retrieveRelevantMemories(query, characterId, topK = 4, sessionId = null) {
    const pyResults = await this.pyClient.retrieveMemories(query, characterId, topK, 0.25);
    if (pyResults && pyResults.length > 0) {
      return pyResults;
    }

    const charMemories = await this.repository.findForContext(characterId, sessionId);
    if (charMemories.length === 0) return [];

    const scored = charMemories.map((mem, idx) => {
      const sim = this.computeSimilarity(query, mem.content);
      const recencyBoost = ((idx + 1) / charMemories.length) * 0.12;
      const json = mem.toJSON();
      json.similarity = Number((sim + recencyBoost).toFixed(3));
      return json;
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Automatically detect and store memorable facts from a conversation turn
   */
  async detectAndStoreFromTurn(userMessage, aiResponse, characterId, sessionId = null) {
    try {
      if (!userMessage && !aiResponse) return;

      if (userMessage) {
        const userFactPatterns = [
          /\b(?:my name is|call me|i'm called|tên tôi là|tên mình là|gọi tôi là|gọi mình là)\s+([^.!?\n]{2,50})/i,
          /\b(?:i love|i really like|my favorite .* is|i hate|i am afraid of|i work as|i study|tôi thích|mình thích|tôi ghét|tôi sợ|tôi đang học|tôi làm nghề)\s+([^.!?\n]{3,100})/i,
          /\b(?:remember that|don't forget that|nhớ rằng|đừng quên là)\s+([^.!?\n]{5,140})/i
        ];

        for (const pattern of userFactPatterns) {
          const match = userMessage.match(pattern);
          if (match) {
            await this.addMemory(`User shared: "${match[0].trim()}"`, characterId, 'conversation', sessionId);
          }
        }
      }

      if (aiResponse && aiResponse.length > 60) {
        const memoryKeywords = [
          'remember', 'promise', 'always', 'never', 'favorite', 'secret',
          'childhood', 'past', 'dream', 'swear', 'treasure', 'friend',
          'hứa', 'nhớ', 'kỷ niệm', 'ước mơ', 'bí mật', 'bạn bè'
        ];
        const lowerResp = aiResponse.toLowerCase();
        if (memoryKeywords.some(k => lowerResp.includes(k))) {
          const sentences = aiResponse
            .replace(/\*/g, '')
            .split(/[.!?\n]+/)
            .map(s => s.trim())
            .filter(s => s.length > 25 && s.length < 180);

          const matchingSentence = sentences.find(s =>
            memoryKeywords.some(k => s.toLowerCase().includes(k))
          );

          if (matchingSentence) {
            await this.addMemory(matchingSentence, characterId, 'conversation', sessionId);
          }
        }
      }
    } catch (error) {
      console.warn('[MEMORY SERVICE] Auto-detection warning:', error.message);
    }
  }

  /**
   * Retrieve rolling narrative story summary for a session via O(1) query
   */
  async getSessionStorySummary(sessionId) {
    if (!sessionId) return '';
    try {
      const summaryMem = await this.repository.findStorySummary(sessionId);
      return summaryMem ? summaryMem.content : '';
    } catch {
      return '';
    }
  }

  /**
   * Automatically generate a rolling story checkpoint summarizing earlier conversation turns
   */
  async updateRollingStorySummary(session, character, apiKey = process.env.GEMINI_API_KEY) {
    try {
      if (!session || !session.messages || session.messages.length < 24) return null;

      const totalMsgs = session.messages.length;
      // Trigger update roughly every 12 messages
      if (totalMsgs % 12 !== 0 && totalMsgs !== 24) return null;

      const existingSummary = await this.getSessionStorySummary(session.id);
      const olderMsgs = session.messages.slice(0, totalMsgs - 10);
      if (olderMsgs.length < 8) return null;

      const conversationSnippet = olderMsgs.map(m => {
        const text = (m.variants && m.variants[m.selectedVariantIndex]?.text) || m.content;
        const speaker = m.role === 'user' ? 'User' : character.name;
        return `${speaker}: ${text.slice(0, 300)}`;
      }).join('\n');

      if (!apiKey) return null;
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const summaryPrompt = `You are a story chronicler for an ongoing roleplay narrative. Summarize the following earlier events between User and ${character.name} into a cohesive narrative recap (3-5 sentences).
Preserve:
1. Key places visited and battles/events that occurred
2. Promises, confessions, shared secrets, and agreements
3. The current dynamic and emotional bond between the characters

Earlier Conversation:
${conversationSnippet.slice(0, 15000)}

${existingSummary ? `Previous Story Arc Summary:\n${existingSummary}\n` : ''}

Output ONLY the distilled narrative summary text:`;

      const modelsToTry = [...new Set([
        config.GEMINI_MODEL,
        config.GEMINI_FALLBACK_MODEL,
        'gemini-2.5-flash',
        'gemini-2.0-flash'
      ].filter(Boolean))];

      let summaryText = '';
      for (const modelName of modelsToTry) {
        try {
          const res = await ai.models.generateContent({
            model: modelName,
            contents: summaryPrompt
          });
          summaryText = (res.text || '').trim();
          if (summaryText) break;
        } catch {
          // Continue to next fallback model
        }
      }

      if (!summaryText) return null;
      const saved = await this.repository.upsertStorySummary(character.id, session.id, summaryText);
      return saved ? saved.toJSON() : null;
    } catch (err) {
      console.warn('[MEMORY SERVICE] Rolling summary warning:', err.message);
      return null;
    }
  }
}

export const memoryService = new SemanticMemoryService();

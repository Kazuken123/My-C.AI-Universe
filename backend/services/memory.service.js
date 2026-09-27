import { storage } from './storage.service.js';
import { memoryClient } from '../ai/memory/memoryClient.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'up', 'about', 'into', 'over', 'after', 'is', 'am', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'it', 'its',
  'they', 'them', 'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who',
  'whom', 'how', 'when', 'where', 'why', 'just', 'very', 'too', 'also', 'so', 'than'
]);

/**
 * Tokenize and normalize text into meaningful terms
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));
}

/**
 * Compute cosine similarity + keyword overlap between query and memory content
 * @param {string} query
 * @param {string} memoryText
 * @returns {number} Similarity score between 0 and 1
 */
function computeSimilarity(query, memoryText) {
  const qTokens = tokenize(query);
  const mTokens = tokenize(memoryText);
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
      // Partial stem / substring match bonus
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
 * Hybrid Long-Term Semantic Memory Service
 * Works out-of-the-box with Node.js storage + similarity scoring, and bridges to Python sentence-transformers if active.
 */
export const memoryService = {
  /**
   * Get all memories, optionally filtered by characterId
   */
  getMemories(characterId = null) {
    const memories = storage.getMemories();
    if (characterId) {
      return memories.filter(m => m.characterId === characterId);
    }
    return memories;
  },

  /**
   * Add a new memory for a character (deduplicated)
   */
  async addMemory(content, characterId, source = 'conversation', sessionId = null) {
    if (!content || !content.trim() || !characterId) return null;
    const cleanContent = content.trim();

    const memories = storage.getMemories();
    const charMemories = memories.filter(m => m.characterId === characterId);

    // Avoid storing duplicate or near-identical memories
    const isDuplicate = charMemories.some(
      m => m.content.toLowerCase() === cleanContent.toLowerCase() ||
           computeSimilarity(cleanContent, m.content) > 0.85
    );
    if (isDuplicate) return null;

    const newMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      characterId,
      sessionId,
      content: cleanContent,
      source,
      createdAt: new Date().toISOString()
    };

    memories.push(newMemory);
    storage.saveMemories(memories);

    // Also sync to optional Python service if running
    memoryClient.addMemory(cleanContent, characterId, { source, sessionId }).catch(() => {});

    return newMemory;
  },

  /**
   * Delete a memory by ID
   */
  deleteMemory(memoryId) {
    const memories = storage.getMemories();
    const filtered = memories.filter(m => m.id !== memoryId);
    if (filtered.length === memories.length) return false;
    storage.saveMemories(filtered);
    return true;
  },

  /**
   * Retrieve top-K relevant memories for a query and character
   */
  async retrieveRelevantMemories(query, characterId, topK = 4) {
    // 1. Try Python sentence-transformers microservice first if running
    const pyResults = await memoryClient.retrieveMemories(query, characterId, topK, 0.25);
    if (pyResults && pyResults.length > 0) {
      return pyResults;
    }

    // 2. Built-in Node.js semantic & recency ranking
    const charMemories = this.getMemories(characterId);
    if (charMemories.length === 0) return [];

    const scored = charMemories.map((mem, idx) => {
      const sim = computeSimilarity(query, mem.content);
      // Small recency/base boost so core character facts remain accessible
      const recencyBoost = ((idx + 1) / charMemories.length) * 0.12;
      return {
        ...mem,
        similarity: Number((sim + recencyBoost).toFixed(3))
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  },

  /**
   * Detect and extract long-term memories from a user/character conversation turn
   */
  async detectAndStoreFromTurn(userMessage, aiResponse, characterId, sessionId = null) {
    try {
      if (!userMessage && !aiResponse) return;

      // 1. Check if user shared personal facts ("my name is", "I like", "I am", "remember that")
      if (userMessage) {
        const userFactPatterns = [
          /\b(?:my name is|call me|i'm called)\s+([^.!?\n]{2,50})/i,
          /\b(?:i love|i really like|my favorite .* is|i hate|i am afraid of|i work as|i study)\s+([^.!?\n]{3,100})/i,
          /\b(?:remember that|don't forget that)\s+([^.!?\n]{5,140})/i
        ];

        for (const pattern of userFactPatterns) {
          const match = userMessage.match(pattern);
          if (match) {
            await this.addMemory(`User shared: "${match[0].trim()}"`, characterId, 'conversation', sessionId);
          }
        }
      }

      // 2. Check AI response for memorable lore or promises
      if (aiResponse && aiResponse.length > 60) {
        const memoryKeywords = [
          'remember', 'promise', 'always', 'never', 'favorite', 'secret',
          'childhood', 'past', 'dream', 'swear', 'treasure', 'friend'
        ];
        const lowerResp = aiResponse.toLowerCase();
        if (memoryKeywords.some(k => lowerResp.includes(k))) {
          const sentences = aiResponse
            .replace(/\*/g, '')
            .split(/[.!?]+/)
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
      console.warn('[MEMORY] Auto-detection warning:', error.message);
    }
  }
};

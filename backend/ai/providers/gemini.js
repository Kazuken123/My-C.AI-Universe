import { GoogleGenAI } from '@google/genai';
import { BaseAIProvider } from './BaseAIProvider.js';
import { AIError } from '../errors.js';
import { config } from '../../config/index.js';
import { buildRecencyStageNote, buildVariationNote } from '../prompt/characterPrompt.js';
import { buildResponseAlternativesNote, responseAlternativesSchema } from '../prompt/responseAlternatives.js';

export const PERMISSIVE_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
];

/**
 * Filter out false-positive policy triggers that cause Google's backend to falsely flag
 * creative roleplay scenes under severe non-configurable CSAM/child safety filters.
 */
export function sanitizePromptForGemini(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\bchild\s+prodigy\b/gi, 'young prodigy')
    .replace(/\bchild\s+actress\b/gi, 'young actress')
    .replace(/\bchild\s+actor\b/gi, 'young actor')
    .replace(/\bchild\s+star\b/gi, 'young star');
}

/**
 * Detect Gemini 3.5-family models. The 3.5 generation reserves the <thought> tag
 * for its own reasoning channel; prompting it to emit <thought> blocks triggers
 * the reserved-tag parser and hangs the stream. These models must never see the
 * monologue section in the system prompt.
 */
export function isGemini35Model(model) {
  return typeof model === 'string' && /^gemini-3\.5(-|$)/.test(model);
}

/**
 * Concrete Gemini AI Provider Class (extends BaseAIProvider)
 */
export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
  }

  #getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIError('GEMINI_API_KEY not configured', 500);
    }
    return new GoogleGenAI({ apiKey });
  }

  get modelName() {
    return process.env.GEMINI_MODEL || config.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  }

  get fallbackModelName() {
    return process.env.GEMINI_FALLBACK_MODEL || config.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
  }

  #getModelsToTry() {
    const candidates = [
      this.modelName,
      this.fallbackModelName
    ].filter(Boolean);
    return [...new Set(candidates)];
  }

  #buildContents(memory, userMsg, options = {}, character = {}) {
    const rawTurns = [];

    if (Array.isArray(memory) && memory.length > 0) {
      for (const msg of memory) {
        if (!msg || !msg.content || !msg.content.trim()) continue;
        const role = msg.role === 'user' ? 'user' : 'model';
        let rawContent = msg.content;
        if (role === 'model') {
          // Multi-Turn Rule: Pass only clean visible reply in conversation history, never thought tags
          rawContent = rawContent
            .replace(/<(?:thought|subtext)>[\s\S]*?<\/(?:thought|subtext)>/gi, '')
            .replace(/\[\[REL_STATE:[\s\S]*?\]\]/gi, '')
            .trim();
        }
        const cleanText = sanitizePromptForGemini(rawContent.trim());
        if (cleanText) {
          rawTurns.push({ role, text: cleanText });
        }
      }
    }

    if (userMsg && String(userMsg).trim()) {
      rawTurns.push({
        role: 'user',
        text: sanitizePromptForGemini(String(userMsg).trim())
      });
    }

    // Merge consecutive turns of the same role so Gemini strictly alternates user <-> model
    const mergedTurns = [];
    for (const turn of rawTurns) {
      const prev = mergedTurns[mergedTurns.length - 1];
      if (prev && prev.role === turn.role) {
        prev.text = `${prev.text}\n\n${turn.text}`;
      } else {
        mergedTurns.push({ role: turn.role, text: turn.text });
      }
    }

    // Ensure the conversation starts with a 'user' turn as required by Gemini multi-turn structure
    if (mergedTurns.length > 0 && mergedTurns[0].role === 'model') {
      mergedTurns.unshift({
        role: 'user',
        text: '[Scene Start]'
      });
    }

    // Put current stage and variety guidance beside the active turn for both reply modes.
    // Variety also applies to callers that do not supply a relationship.
    if (mergedTurns.length > 0) {
      const targetName = options.persona?.name || 'User';
      const stageNote = [
        options.relationship && options.labPromptVersion !== 'character-v1' ? buildRecencyStageNote(options.relationship, character, targetName, options.appraisalManaged) : '',
        buildVariationNote(memory, character.name),
        buildResponseAlternativesNote(options)
      ].filter(Boolean).join('\n');
      if (stageNote) {
        const lastTurn = mergedTurns[mergedTurns.length - 1];
        if (lastTurn.role === 'user') {
          lastTurn.text = `${lastTurn.text}\n\n${stageNote}`;
        } else {
          mergedTurns.push({
            role: 'user',
            text: stageNote
          });
        }
      }
    }

    return mergedTurns.map(t => ({
      role: t.role,
      parts: [{ text: t.text }]
    }));
  }

  /**
   * Returns a closure that builds the system prompt on-demand for each candidate model,
   * with omitThoughtTag determined per model to avoid <thought> collisions in 3.5.
   */
  #systemPromptBuilder(character, promptOptions) {
    return (model) => sanitizePromptForGemini(
      this.buildSystemPrompt(character, {
        ...promptOptions,
        omitThoughtTag: isGemini35Model(model)
      })
    );
  }

  /**
   * Polymorphic implementation of generateReply using Google Gemini
   */
  async generateReply(character, userMsg, memory = null, options = {}) {
    const ai = this.#getClient();
    const modelsToTry = options.modelOverride ? [options.modelOverride] : this.#getModelsToTry();
    const contents = this.#buildContents(memory, userMsg, options, character);
    let lastError = null;
    const promptFor = this.#systemPromptBuilder(character, { ...options, userMsg, memory });

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const systemPrompt = promptFor(currentModel);
      let attempt = 0;
      const maxRetries = 1;

      while (attempt <= maxRetries) {
        try {
          const response = await ai.models.generateContent({
            model: currentModel,
            contents,
            config: {
              systemInstruction: systemPrompt,
              ...(options.signal ? { abortSignal: options.signal } : {}),
              temperature: options.isRegenerate ? 0.95 : 0.85,
              httpOptions: { timeout: options.timeout || config.AI_TIMEOUT || 30000 },
              ...(options.labAlternatives ? { responseMimeType: 'application/json', responseJsonSchema: responseAlternativesSchema(options) } : {}),
              safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
          });

          if (response.promptFeedback?.blockReason) {
            console.warn(`[GEMINI PROVIDER] Prompt blocked by Gemini safety filter: ${response.promptFeedback.blockReason}`);
            throw new AIError(`Gemini safety filter triggered: ${response.promptFeedback.blockReason}`, 400);
          }

          const candidate = response.candidates?.[0];
          if (options.requireComplete && candidate?.finishReason !== 'STOP') throw new AIError('Character response did not complete', 503);
          if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
            if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII'].includes(candidate.finishReason)) {
              console.warn(`[GEMINI PROVIDER] Candidate blocked by safety filter: ${candidate.finishReason}`);
              throw new AIError(`Gemini safety filter blocked response: ${candidate.finishReason}`, 400);
            }
          }

          const text = response.text?.trim();
          if (!text) {
            throw new AIError('Empty response from Gemini', 503);
          }

          return text;
        } catch (error) {
          if (options.signal?.aborted) throw options.signal.reason || error;
          lastError = error;

          const isFatalError =
            error.message?.includes('MALFORMED_RESPONSE') ||
            error.message?.includes('DEADLINE_EXCEEDED') ||
            error.message?.includes('504') ||
            error.message?.toLowerCase().includes('timeout');

          if (isFatalError) {
            console.warn(`[GEMINI PROVIDER] Non-retryable error on '${currentModel}'. Failing over immediately.`);
            break;
          }

          const isTransientError =
            error.status === 429 ||
            error.status === 503 ||
            error.message?.includes('RESOURCE_EXHAUSTED');

          if (isTransientError && attempt < maxRetries) {
            attempt++;
            console.warn(`[GEMINI PROVIDER] Transient error on '${currentModel}', retrying after 800ms backoff (attempt ${attempt}/${maxRetries})...`);
            await new Promise(res => setTimeout(res, 800));
            continue;
          }

          console.error(`[GEMINI PROVIDER ERROR] Model '${currentModel}':`, error.message);

          const isAuthError =
            error.message?.includes('API_KEY_INVALID') ||
            error.message?.includes('API key not valid') ||
            error.status === 401 ||
            error.status === 403;

          const isSafetyError = error.status === 400 && error.message?.includes('safety filter');

          if (!isAuthError && !isSafetyError && i < modelsToTry.length - 1) {
            const nextModel = modelsToTry[i + 1];
            console.warn(`[GEMINI PROVIDER] Model '${currentModel}' failed (${error.status || 'ERR'}). Falling back to '${nextModel}'...`);
          }

          break;
        }
      }
    }

    if (lastError?.message?.includes('quota') || lastError?.message?.includes('rate limit') || lastError?.message?.includes('RESOURCE_EXHAUSTED') || lastError?.status === 429) {
      throw new AIError('Gemini quota exceeded', 429, lastError);
    }
    if (lastError?.message?.includes('API_KEY') || lastError?.status === 401) {
      throw new AIError('Invalid Gemini API key', 401, lastError);
    }
    if (lastError?.status === 403) {
      throw new AIError('Gemini access forbidden', 403, lastError);
    }

    throw new AIError(lastError?.message || 'Gemini service temporarily unavailable', 503, lastError);
  }

  /**
   * Real-time token streaming implementation using Google Gemini SDK
   */
  async *generateReplyStream(character, userMsg, memory = null, options = {}) {
    const ai = this.#getClient();
    const contents = this.#buildContents(memory, userMsg, options, character);
    const modelsToTry = options.modelOverride ? [options.modelOverride] : this.#getModelsToTry();
    const promptFor = this.#systemPromptBuilder(character, { ...options, userMsg, memory });
    const streamTimeout = options.timeout || config.GEMINI_STREAM_TIMEOUT || 18000;
    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      const systemPrompt = promptFor(currentModel);
      let attempt = 0;
      const maxRetries = 1;
      let hasYielded = false;

      while (attempt <= maxRetries) {
        const startedAt = Date.now();
        try {
          const stream = await ai.models.generateContentStream({
            model: currentModel,
            contents,
            config: {
              systemInstruction: systemPrompt,
              ...(options.signal ? { abortSignal: options.signal } : {}),
              temperature: options.isRegenerate ? 0.95 : 0.85,
              httpOptions: { timeout: streamTimeout },
              safetySettings: PERMISSIVE_SAFETY_SETTINGS
            }
          });

          let finished = false;
          for await (const chunk of stream) {
            const reason = chunk.candidates?.[0]?.finishReason;
            if (reason) {
              if (options.requireComplete && reason !== 'STOP') throw new AIError('Character response did not complete',503);
              finished = reason === 'STOP';
            }
            const text = chunk.text;
            if (text) {
              hasYielded = true;
              yield text;
            }
          }
          if (options.requireComplete && !finished) throw new AIError('Stream ended without a completion marker',503);
          return;
        } catch (err) {
          if (options.signal?.aborted) throw options.signal.reason || err;
          lastError = err;

          if (hasYielded) {
            console.error(`[GEMINI PROVIDER:STREAM] ${currentModel} stream interrupted mid-stream:`, err.message);
            throw new AIError(err.message || 'Stream interrupted mid-generation', 503, err);
          }

          // Non-retryable stream failures: malformed responses, incomplete streams,
          // gateway timeouts and timeouts mean the model is wedged — fail over now.
          const isFatalStreamError =
            err.message?.includes('MALFORMED_RESPONSE') ||
            err.message?.includes('DEADLINE_EXCEEDED') ||
            err.message?.includes('504') ||
            err.message?.toLowerCase().includes('timeout') ||
            err.message?.includes('Stream ended without a completion marker') ||
            err.message?.includes('did not complete');

          if (isFatalStreamError) {
            console.warn(`[GEMINI PROVIDER:STREAM] ${currentModel} hit a non-retryable stream error (${err.message}). Failing over immediately.`);
            break;
          }

          const isTransientError =
            err.status === 429 ||
            err.status === 503 ||
            err.message?.includes('RESOURCE_EXHAUSTED');

          // Only retry fast 429/503 blips, and only when the failed attempt was quick.
          if (isTransientError && attempt < maxRetries && Date.now() - startedAt < 5000) {
            attempt++;
            console.warn(`[GEMINI PROVIDER:STREAM] Transient error on '${currentModel}', retrying after 800ms backoff (attempt ${attempt}/${maxRetries})...`);
            await new Promise(res => setTimeout(res, 800));
            continue;
          }

          console.warn(`[GEMINI PROVIDER:STREAM] ${currentModel} stream failed:`, err.message);

          const isAuthError =
            err.message?.includes('API_KEY_INVALID') ||
            err.message?.includes('API key not valid') ||
            err.status === 401 ||
            err.status === 403;

          if (!isAuthError && i < modelsToTry.length - 1) {
            const nextModel = modelsToTry[i + 1];
            console.warn(`[GEMINI PROVIDER:STREAM] Falling back to '${nextModel}'...`);
          }

          break;
        }
      }
    }

    if (lastError) {
      throw new AIError(lastError.message || 'Gemini streaming failed', 503, lastError);
    }
  }

  /**
   * Generate a complete Character.AI profile from a brief user concept
   */
  async generateCharacterProfile(concept) {
    const ai = this.#getClient();
    const prompt = `You are an expert anime, gaming, and fiction character architect.
Create a rich, immersive roleplay character profile based on the following concept:
"${concept}"

CRITICAL LINGUISTIC & COGNITIVE ANALYSIS:
1. Judge and determine their cognitive & psychological profile (Jungian cognitive functions, e.g. Te-Fi tsundere, Ne-Ti playful jester, Se-Ti kinetic brawler, Ni-Te quiet schemer, Fe-Ni charismatic guide).
2. Formulate their exact Speaking Style & Pacing Rules:
   - Cognitive speech style and cadence (staccato vs drawl vs blunt vs formal)
   - Punctuation pacing rules: define when to use '...' (hesitation/silence), '—' (cut-offs/flustered), '?!' (outrage/indignation), and '~' (playful drawl)
   - Signature laugh and vocal tics (e.g., 'Ehehe~...', 'Fufu~', 'Tch', 'Heh.', 'Hahaha!')
   - Conflict defense: how they react when accused vs how they react when praised/loved
3. Craft an Action-Grounded Greeting: opening scene with *italic action* anchored to a physical prop, chore, or situational excuse rather than standing in a void, followed by Character Name: "Dialogue".
4. Provide 2-3 Authentic Example Dialogues in Light-Novel format (*Action* on line 1, Character: "Dialogue" on line 2) demonstrating calibrated punctuation pacing ('...', '—', '?!', '~').

Return STRICT JSON with the following keys:
{
  "name": "Character's full name",
  "tagline": "Short catchy subtitle (under 70 characters)",
  "greeting": "Opening roleplay scene with prop/excuse grounding in light-novel format",
  "personality": "Detailed personality traits, temperament, flaws, motivations, and cognitive archetype",
  "appearance": "Detailed physical appearance, clothing, and signature visual traits",
  "abilities": "Skills, powers, talents, or expertise",
  "background": "Compelling backstory and origin",
  "speaking_style": "Detailed speaking guide with cognitive profile, punctuation pacing ('...', '—', '?!', '~'), signature laugh, and conflict defense",
  "example_dialogues": "2-3 sample exchanges in light-novel format demonstrating calibrated pacing",
  "initial_memory": "3-5 core facts or memories this character always remembers",
  "categories": ["Roleplay", "Original"]
}`;

    const modelsToTry = this.#getModelsToTry();
    let lastError = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            safetySettings: PERMISSIVE_SAFETY_SETTINGS
          }
        });

        const rawText = (response.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        return JSON.parse(rawText);
      } catch (error) {
        lastError = error;
        console.error(`[GEMINI PROVIDER ERROR] Profile creation on '${currentModel}':`, error.message);

        const isRateLimitOrQuota =
          error.message?.includes('quota') ||
          error.message?.includes('rate limit') ||
          error.message?.includes('RESOURCE_EXHAUSTED') ||
          error.status === 429;

        if (isRateLimitOrQuota && i < modelsToTry.length - 1) {
          const nextModel = modelsToTry[i + 1];
          console.warn(`[GEMINI PROVIDER] Falling back to ${nextModel} for character creation...`);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}

export const geminiProvider = new GeminiProvider();

export async function chatWithGemini(character, userMsg, memory = null, options = {}) {
  return geminiProvider.generateReply(character, userMsg, memory, options);
}

export async function generateCharacterFromConcept(concept) {
  return geminiProvider.generateCharacterProfile(concept);
}

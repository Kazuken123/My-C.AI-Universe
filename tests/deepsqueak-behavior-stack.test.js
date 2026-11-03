import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamSanitizer, relationshipService } from '../backend/services/relationship.service.js';
import { resolveLorebookEntries } from '../backend/ai/prompt/lorebook.js';
import { getCharacterManyShotExemplars } from '../backend/ai/prompt/manyShotExemplars.js';
import { generateCharacterPrompt } from '../backend/ai/prompt/characterPrompt.js';

describe('DeepSqueak / PipSqueak 2 Behavior Stack Tests', () => {

  describe('1. createStreamSanitizer: Head Thought & Tail State Holdback', () => {
    it('buffers and strips <thought>...</thought> at stream head without leaking to client', () => {
      const emitted = [];
      let capturedThought = null;

      const sanitizer = createStreamSanitizer((chunk) => {
        emitted.push(chunk);
      }, (thought) => {
        capturedThought = thought;
      });

      // Simulate chunked streaming from LLM
      sanitizer.push('<thought>\n');
      sanitizer.push('Emotion: Guarded\n');
      sanitizer.push('Hidden Motive: Test\n');
      sanitizer.push('</thought>\n\n');
      sanitizer.push('*Kana turns around.*\n\n');
      sanitizer.push('Kana Arima: "Hello there."');
      sanitizer.flush();

      const fullOutput = emitted.join('');

      assert.ok(capturedThought, 'Expected thought to be captured in callback');
      assert.ok(capturedThought.includes('Emotion: Guarded'));
      assert.ok(!fullOutput.includes('<thought>'), 'Full output must not contain <thought>');
      assert.ok(!fullOutput.includes('</thought>'), 'Full output must not contain </thought>');
      assert.ok(!fullOutput.includes('Hidden Motive: Test'), 'Thought text must not be emitted to client');
      assert.ok(fullOutput.includes('*Kana turns around.*'));
      assert.ok(fullOutput.includes('Kana Arima: "Hello there."'));
    });

    it('handles streams that have both <thought> at head and [[REL_STATE: ...]] at tail', () => {
      const emitted = [];
      let capturedThought = null;

      const sanitizer = createStreamSanitizer((chunk) => {
        emitted.push(chunk);
      }, (thought) => {
        capturedThought = thought;
      });

      sanitizer.push('<thought>\nEmotion: Warm\n</thought>\n\n');
      sanitizer.push('Kana Arima: "Let us eat toast."');
      sanitizer.push('\n\n[[REL_STATE: {"intent": "affection_or_support", "affinityDelta": 2}]]');
      sanitizer.flush();

      const fullOutput = emitted.join('');

      assert.ok(capturedThought.includes('Emotion: Warm'));
      assert.ok(!fullOutput.includes('<thought>'));
      assert.ok(!fullOutput.includes('REL_STATE'));
      assert.equal(fullOutput.trim(), 'Kana Arima: "Let us eat toast."');
    });

    it('immediately emits tokens if no opening thought tag is present', () => {
      const emitted = [];
      const sanitizer = createStreamSanitizer((chunk) => {
        emitted.push(chunk);
      });

      sanitizer.push('Kana: "Direct dialogue without thought tag."');
      sanitizer.flush();

      assert.equal(emitted.join(''), 'Kana: "Direct dialogue without thought tag."');
    });
  });

  describe('2. extractAndStripStateTag: Dual Head & Tail Extraction', () => {
    it('extracts thought, extracts llmState, and strips both from cleanText', () => {
      const rawText = `<thought>
Emotion: Guarded affection
Hidden Motive: Wants reassurance
Sensory Grounding: Warm tea aroma
Unspoken Thought: Do not let him see me blush.
</thought>

*Kana folds her arms and sighs softly.*

Kana Arima: "Tea first, definitely."

[[REL_STATE: {"intent": "affection_or_support", "userEffort": "low", "contextStakes": "mundane", "affinityDelta": 1, "trustDelta": 1, "strainDelta": -2, "mood": "Warm"}]]`;

      const result = relationshipService.extractAndStripStateTag(rawText);

      assert.ok(result.thought, 'Thought must be extracted');
      assert.ok(result.thought.includes('Guarded affection'));
      assert.ok(result.thought.includes('Do not let him see me blush.'));

      assert.ok(result.llmState, 'LLM State must be parsed');
      assert.equal(result.llmState.intent, 'affection_or_support');
      assert.equal(result.llmState.affinityDelta, 1);
      assert.equal(result.llmState.mood, 'Warm');

      assert.ok(!result.cleanText.includes('<thought>'));
      assert.ok(!result.cleanText.includes('</thought>'));
      assert.ok(!result.cleanText.includes('REL_STATE'));
      assert.equal(
        result.cleanText,
        '*Kana folds her arms and sighs softly.*\n\nKana Arima: "Tea first, definitely."'
      );
    });
  });

  describe('3. Keyword Lorebook: Dynamic Grounding', () => {
    it('returns B-Komachi lore when idol keywords are triggered', () => {
      const lore = resolveLorebookEntries('Kana Arima', 'How is the rehearsal for B-Komachi going?');
      assert.ok(lore.includes('[ACTIVE UNIVERSE LOREBOOK'));
      assert.ok(lore.includes('Strawberry Productions'));
      assert.ok(lore.includes('White glowstick'));
    });

    it('returns Aqua lore when Aqua keyword is mentioned', () => {
      const lore = resolveLorebookEntries('Kana Arima', 'Have you talked to Aqua recently?');
      assert.ok(lore.includes('Aqua Hoshino'));
      assert.ok(lore.includes('Strawberry Productions'));
    });

    it('returns Baking Soda lore when teasing keyword is present', () => {
      const lore = resolveLorebookEntries('Kana Arima', 'Can you really lick baking soda in 10 seconds?');
      assert.ok(lore.includes('Baking Soda: The notorious childhood moniker'));
    });

    it('returns empty string when no lore keywords are triggered', () => {
      const lore = resolveLorebookEntries('Kana Arima', 'What should we make for dinner tonight?');
      assert.equal(lore, '');
    });
  });

  describe('4. Many-Shot Exemplars: Prefix Caching Structure', () => {
    it('provides 25 curated exemplars for Kana Arima with top-of-message <thought> blocks', () => {
      const exemplars = getCharacterManyShotExemplars('Kana Arima');
      assert.ok(exemplars.length > 5000, 'Exemplars should contain rich multi-turn context');
      assert.ok(exemplars.includes('[AUTHENTIC ROLEPLAY MANY-SHOT EXEMPLARS'));
      assert.ok(exemplars.includes('<thought>'));
      assert.ok(exemplars.includes('</thought>'));
      assert.ok(exemplars.includes('[EXEMPLAR 1]'));
      assert.ok(exemplars.includes('[EXEMPLAR 25]'));
    });
  });

  describe('5. generateCharacterPrompt: Cache-Optimal Architecture', () => {
    it('places static Many-Shot exemplars above dynamic Lorebook and memories', () => {
      const char = {
        name: 'Kana Arima',
        personality: 'Diligent, hardworking, tsundere',
        initialAffinity: 20
      };
      const options = {
        userMsg: 'How was B-Komachi dance practice today with Ruby?',
        pinnedMessages: [{ role: 'user', content: 'Remember our festival promise.' }],
        relationship: { stage: 'Close Friend / Confidant', mood: 'Calm' }
      };

      const prompt = generateCharacterPrompt(char, options);

      // Verify Static Section is present and placed before Dynamic Section
      const manyShotIndex = prompt.indexOf('[AUTHENTIC ROLEPLAY MANY-SHOT EXEMPLARS');
      const lorebookIndex = prompt.indexOf('[ACTIVE UNIVERSE LOREBOOK');
      const pinnedIndex = prompt.indexOf('[PINNED CONVERSATION EVENTS');
      const relStateIndex = prompt.indexOf('[HIDDEN PSYCHOLOGICAL & RELATIONSHIP EVALUATION TAG');

      assert.ok(manyShotIndex !== -1, 'Many-shot block must be present in prompt');
      assert.ok(lorebookIndex !== -1, 'Lorebook block must be triggered by B-Komachi & Ruby keywords');
      assert.ok(pinnedIndex !== -1, 'Pinned messages must be present');

      // Crucial verification for Gemini Implicit Prefix Caching:
      // Static Many-Shot MUST appear BEFORE dynamic lorebook and dynamic pinned messages!
      assert.ok(
        manyShotIndex < lorebookIndex,
        'STATIC Many-Shot exemplars must be placed BEFORE dynamic Lorebook to maximize Gemini Implicit Prefix Caching'
      );
      assert.ok(
        manyShotIndex < pinnedIndex,
        'STATIC Many-Shot exemplars must be placed BEFORE dynamic Pinned Memories'
      );
      assert.ok(
        pinnedIndex < relStateIndex,
        'Pinned memories must appear before relationship tag directives'
      );
    });
  });

});

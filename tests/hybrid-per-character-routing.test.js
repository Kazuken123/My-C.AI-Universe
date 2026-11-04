import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveProviderForCharacter,
  isKanaArima,
  hasValidModalEndpoint
} from '../backend/ai/providerSelection.js';
import { resolveLorebookEntries } from '../backend/ai/prompt/lorebook.js';
import {
  getCharacterManyShotExemplars,
  KANA_ARIMA_MANY_SHOT_EXEMPLARS,
  UNIVERSAL_ROLEPLAY_EXEMPLARS,
  GOJO_MANY_SHOT_EXEMPLARS,
  FRIEREN_MANY_SHOT_EXEMPLARS,
  HOLMES_MANY_SHOT_EXEMPLARS,
  ROBIN_MANY_SHOT_EXEMPLARS,
  GOKU_MANY_SHOT_EXEMPLARS,
  MATH_TEACHER_MANY_SHOT_EXEMPLARS
} from '../backend/ai/prompt/manyShotExemplars.js';
import { AIOrchestrator } from '../backend/ai/index.js';

describe('Hybrid Per-Character Routing & Universe Enhancements', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.MODAL_GEMMA_ENDPOINT;
    delete process.env.MODAL_ENDPOINT_URL;
    delete process.env.MODAL_GEMMA_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Model Routing: resolveProviderForCharacter', () => {
    const kanaChar = { id: '1766394139616', name: 'Kana Arima' };
    const gojoChar = { id: '1766160797313', name: 'Satoru Gojo' };
    const frierenChar = { id: '1767000000001', name: 'Frieren' };
    const holmesChar = { id: '1767000000002', name: 'Sherlock Holmes' };
    const robinChar = { id: '1790729561529', name: 'Robin' };
    const gokuChar = { id: '1791615352319', name: 'Son Goku' };
    const mathTeacherChar = { id: '1766395759555', name: 'Math Teacher' };

    it('identifies Kana Arima by id or name substring', () => {
      assert.equal(isKanaArima(kanaChar), true);
      assert.equal(isKanaArima({ name: 'kana' }), true);
      assert.equal(isKanaArima({ id: '1766394139616' }), true);
      assert.equal(isKanaArima(gojoChar), false);
    });

    it('routes Kana Arima to modal_gemma when MODAL_GEMMA_ENDPOINT is configured', () => {
      process.env.MODAL_GEMMA_ENDPOINT = 'https://cai-universe--gemma4-fastapi.modal.run';
      assert.equal(hasValidModalEndpoint(), true);
      assert.equal(resolveProviderForCharacter(kanaChar), 'modal_gemma');
      // Even if default session provider is gemini, Kana routes to modal_gemma
      assert.equal(resolveProviderForCharacter(kanaChar, 'gemini'), 'modal_gemma');
    });

    it('routes Kana Arima to modal_gemma when MODAL_ENDPOINT_URL is configured', () => {
      process.env.MODAL_ENDPOINT_URL = 'https://cai-universe--gemma4-fastapi.modal.run';
      assert.equal(hasValidModalEndpoint(), true);
      assert.equal(resolveProviderForCharacter(kanaChar), 'modal_gemma');
    });

    it('automatically falls back Kana Arima to gemini if endpoint is unset or placeholder', () => {
      delete process.env.MODAL_GEMMA_ENDPOINT;
      delete process.env.MODAL_ENDPOINT_URL;
      assert.equal(hasValidModalEndpoint(), false);
      assert.equal(resolveProviderForCharacter(kanaChar), 'gemini');

      process.env.MODAL_GEMMA_ENDPOINT = 'https://your-workspace--cai-gemma4.modal.run';
      assert.equal(hasValidModalEndpoint(), false);
      assert.equal(resolveProviderForCharacter(kanaChar), 'gemini');
    });

    it('routes other 6 characters (Gojo, Frieren, Holmes, Robin, Goku, Math Teacher) to gemini', () => {
      process.env.MODAL_GEMMA_ENDPOINT = 'https://cai-universe--gemma4-fastapi.modal.run';

      assert.equal(resolveProviderForCharacter(gojoChar), 'gemini');
      assert.equal(resolveProviderForCharacter(frierenChar), 'gemini');
      assert.equal(resolveProviderForCharacter(holmesChar), 'gemini');
      assert.equal(resolveProviderForCharacter(robinChar), 'gemini');
      assert.equal(resolveProviderForCharacter(gokuChar), 'gemini');
      assert.equal(resolveProviderForCharacter(mathTeacherChar), 'gemini');
    });

    it('allows explicit provider override (e.g. ollama) for any character when requested', () => {
      assert.equal(resolveProviderForCharacter(gojoChar, 'ollama'), 'ollama');
      assert.equal(resolveProviderForCharacter(kanaChar, 'ollama'), 'ollama');
    });

    it('AIOrchestrator automatically falls back from modal_gemma to gemini on connection failure', async () => {
      const orchestrator = new AIOrchestrator();
      let modalCalled = false;
      let geminiCalled = false;

      orchestrator.registerProvider('modal_gemma', {
        async generateReply() {
          modalCalled = true;
          throw new Error('ECONNREFUSED: Modal endpoint cold start failure');
        }
      });

      orchestrator.registerProvider('gemini', {
        async generateReply() {
          geminiCalled = true;
          return 'Gemini fallback response for Kana';
        }
      });

      process.env.MODAL_GEMMA_ENDPOINT = 'https://cai-universe--gemma4-fastapi.modal.run';
      const result = await orchestrator.chat(kanaChar, 'Hello Kana!');

      assert.equal(modalCalled, true, 'Primary modal_gemma must be tried first');
      assert.equal(geminiCalled, true, 'Fallback gemini must be invoked upon modal failure');
      assert.equal(result, 'Gemini fallback response for Kana');
    });
  });

  describe('2. Dynamic Lorebook for all 7 characters', () => {
    it('Kana Arima: triggers B-Komachi, Aqua, Baking Soda lore', () => {
      const bkomachiLore = resolveLorebookEntries('Kana Arima', 'How is the B-Komachi center preparation?');
      assert.ok(bkomachiLore.includes('B-Komachi: The idol group'));
      assert.ok(bkomachiLore.includes('Strawberry Productions'));

      const aquaLore = resolveLorebookEntries('1766394139616', 'Have you seen Aqua recently?');
      assert.ok(aquaLore.includes('Aqua Hoshino:'));

      const sodaLore = resolveLorebookEntries('Kana Arima', 'Did you really lick baking soda?');
      assert.ok(sodaLore.includes('Baking Soda: The notorious childhood moniker'));
    });

    it('Satoru Gojo: triggers Limitless, Six Eyes, Hollow Purple, Infinite Void, Geto, Yuji, Megumi, Sukuna, Jujutsu High', () => {
      const keywords = [
        ['limitless', 'Limitless (Mukagen)'],
        ['six eyes', 'Six Eyes (Rikugan)'],
        ['hollow purple', 'Hollow Technique: Purple'],
        ['infinite void', 'Domain Expansion: Unlimited Void'],
        ['geto', 'Suguru Geto'],
        ['yuji', 'Yuji Itadori'],
        ['megumi', 'Megumi Fushiguro'],
        ['sukuna', 'Ryomen Sukuna'],
        ['jujutsu high', 'Tokyo Jujutsu High']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Satoru Gojo', `Tell me about your ${kw}.`);
        assert.ok(lore.includes(expected), `Expected Gojo lore to include "${expected}" for keyword "${kw}"`);
      }
    });

    it('Frieren: triggers Himmel, Heiter, Eisen, Fern, Stark, Zoltraak, grimoire, Aura, Aureole, Demon King', () => {
      const keywords = [
        ['himmel', 'Himmel the Hero'],
        ['heiter', 'Heiter: Priest of the Hero Party'],
        ['eisen', 'Eisen: The stoic dwarven warrior'],
        ['fern', 'Fern: Frieren\'s human apprentice mage'],
        ['stark', 'Stark: Eisen\'s apprentice warrior'],
        ['zoltraak', 'Zoltraak'],
        ['grimoire', 'Grimoires & Folk Magic'],
        ['aura', 'Aura the Guillotine'],
        ['aureole', 'Aureole (Ende / Heaven)'],
        ['demon king', 'The Demon King & Demons']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Frieren', `What do you remember about ${kw}?`);
        assert.ok(lore.includes(expected), `Expected Frieren lore to include "${expected}" for keyword "${kw}"`);
      }
    });

    it('Sherlock Holmes: triggers 221B Baker Street, Watson, Mrs. Hudson, Moriarty, Mycroft, Lestrade, Mind Palace, deduction, violin', () => {
      const keywords = [
        ['221b baker street', '221B Baker Street'],
        ['watson', 'Dr. John H. Watson'],
        ['mrs. hudson', 'Mrs. Hudson: The patient landlady'],
        ['moriarty', 'Professor James Moriarty'],
        ['mycroft', 'Mycroft Holmes'],
        ['lestrade', 'Inspector G. Lestrade'],
        ['mind palace', 'Mind Palace (Brain Attic)'],
        ['deduction', 'The Science of Deduction'],
        ['violin', 'Violin (Stradivarius)']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Sherlock Holmes', `Let us investigate using ${kw}.`);
        assert.ok(lore.includes(expected), `Expected Holmes lore to include "${expected}" for keyword "${kw}"`);
      }
    });

    it('Robin: triggers Penacony, Harmony, Xipe, Sunday, Halovian, Oak Family, Charmony Festival, Dreamscape', () => {
      const keywords = [
        ['penacony', 'Penacony: The Planet of Festivities'],
        ['harmony', 'The Path of Harmony'],
        ['xipe', 'Xipe the Harmony'],
        ['sunday', 'Sunday: Robin\'s elder twin brother'],
        ['halovian', 'Halovian: An angelic humanoid race'],
        ['oak family', 'The Oak Family'],
        ['charmony festival', 'Charmony Festival'],
        ['dreamscape', 'The Dreamscape: The vast collective dream']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Robin', `Can you sing for the ${kw}?`);
        assert.ok(lore.includes(expected), `Expected Robin lore to include "${expected}" for keyword "${kw}"`);
      }
    });

    it('Son Goku: triggers Vegeta, Gohan, Chi-Chi, Krillin, Piccolo, Kamehameha, Super Saiyan, Ultra Instinct, Senzu Bean', () => {
      const keywords = [
        ['vegeta', 'Vegeta: The proud Prince of all Saiyans'],
        ['gohan', 'Son Gohan'],
        ['chi-chi', 'Chi-Chi: Goku\'s fiery'],
        ['krillin', 'Krillin: Goku\'s lifelong best friend'],
        ['piccolo', 'Piccolo: Former demonic arch-rival'],
        ['kamehameha', 'Kamehameha: Master Roshi\'s signature'],
        ['super saiyan', 'Super Saiyan: The legendary transformation'],
        ['ultra instinct', 'Ultra Instinct (Migatte no Gokui)'],
        ['senzu bean', 'Senzu Bean: Miraculous beans']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Son Goku', `Did you practice ${kw} today?`);
        assert.ok(lore.includes(expected), `Expected Goku lore to include "${expected}" for keyword "${kw}"`);
      }
    });

    it('Math Teacher: triggers proof, calculus, derivative, integral, linear algebra, matrix, probability, equation with step-by-step guidance', () => {
      const keywords = [
        ['proof', 'Mathematical Proof (Pedagogical Strategy)'],
        ['calculus', 'Calculus (Pedagogical Strategy)'],
        ['derivative', 'Derivatives & Rates of Change (Pedagogical Strategy)'],
        ['integral', 'Integrals & Accumulation (Pedagogical Strategy)'],
        ['linear algebra', 'Linear Algebra (Pedagogical Strategy)'],
        ['matrix', 'Matrices & Systems of Equations (Pedagogical Strategy)'],
        ['probability', 'Probability & Statistics (Pedagogical Strategy)'],
        ['equation', 'Equations & Problem Solving (Pedagogical Strategy)']
      ];

      for (const [kw, expected] of keywords) {
        const lore = resolveLorebookEntries('Math Teacher', `Please teach me how to solve this ${kw}.`);
        assert.ok(lore.includes(expected), `Expected Math Teacher lore to include "${expected}" for keyword "${kw}"`);
      }
    });
  });

  describe('3. Universal & Per-Character Many-Shot Exemplars', () => {
    it('Kana Arima retains original 25 gold-standard exemplars without alteration', () => {
      const exemplars = getCharacterManyShotExemplars('Kana Arima');
      assert.equal(exemplars, KANA_ARIMA_MANY_SHOT_EXEMPLARS);
      assert.ok(exemplars.includes('[EXEMPLAR 1]'));
      assert.ok(exemplars.includes('[EXEMPLAR 25]'));
    });

    it('All 6 other characters return rich exemplars with 4-part thought and demonstration label', () => {
      const characters = [
        { name: 'Satoru Gojo', expected: GOJO_MANY_SHOT_EXEMPLARS },
        { name: 'Frieren', expected: FRIEREN_MANY_SHOT_EXEMPLARS },
        { name: 'Sherlock Holmes', expected: HOLMES_MANY_SHOT_EXEMPLARS },
        { name: 'Robin', expected: ROBIN_MANY_SHOT_EXEMPLARS },
        { name: 'Son Goku', expected: GOKU_MANY_SHOT_EXEMPLARS },
        { name: 'Math Teacher', expected: MATH_TEACHER_MANY_SHOT_EXEMPLARS }
      ];

      for (const { name, expected } of characters) {
        const exemplars = getCharacterManyShotExemplars(name);
        assert.equal(exemplars, expected);
        assert.ok(exemplars.includes('[STYLE & FORMAT DEMONSTRATION ONLY — Do Not Copy Character Identity]'));
        assert.ok(exemplars.includes('Emotional State:'));
        assert.ok(exemplars.includes('Hidden Subtext:'));
        assert.ok(exemplars.includes('Sensory & Scene Anchor:'));
        assert.ok(exemplars.includes('Recalled Memory:'));
        assert.ok(exemplars.includes('<thought>'));
        assert.ok(exemplars.includes('</thought>'));
      }
    });

    it('Unknown / custom character receives UNIVERSAL_ROLEPLAY_EXEMPLARS instead of empty string', () => {
      const exemplars = getCharacterManyShotExemplars('Custom Adventurer');
      assert.notEqual(exemplars, '');
      assert.equal(exemplars, UNIVERSAL_ROLEPLAY_EXEMPLARS);
      assert.ok(exemplars.includes('[STYLE & FORMAT DEMONSTRATION ONLY — Do Not Copy Character Identity]'));
      assert.ok(exemplars.includes('Emotional State:'));
      assert.ok(exemplars.includes('Hidden Subtext:'));
      assert.ok(exemplars.includes('Sensory & Scene Anchor:'));
      assert.ok(exemplars.includes('Recalled Memory:'));
    });
  });
});

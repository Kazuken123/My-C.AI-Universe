import 'dotenv/config';
import { CharacterRepository } from '../backend/repositories/CharacterRepository.js';
import { GeminiProvider } from '../backend/ai/providers/gemini.js';

async function testLiveCharacterGeneration() {
  console.log('🧪 Running Live Character Generation Validation with Kana Arima...\n');

  const repo = new CharacterRepository();
  const kana = await repo.findById('1766394139616');
  if (!kana) {
    throw new Error('Kana Arima not found in database');
  }

  const gemini = new GeminiProvider();

  const relState = {
    affinity: 65,
    trust: 60,
    strain: 0,
    stage: 'Crush / Infatuated',
    mood: 'Calm'
  };

  // Test 1: Normal Everyday / Work / Lunch Question
  console.log('--- TEST 1: Everyday & Rehearsal Question (Normal Operational Baseline) ---');
  const userMsg1 = "Hey Kana, did you eat lunch yet? How's the new choreography coming along for the upcoming show?";
  console.log(`User: "${userMsg1}"\n`);

  const response1 = await gemini.generateReply(
    kana,
    userMsg1,
    [],
    {
      persona: { name: 'Aqua' },
      relationship: relState
    }
  );
  console.log(`Kana Arima Response (Turn 1):\n${response1}\n`);

  // Test 2: Romantic / Sincere Vulnerability Trigger
  console.log('--- TEST 2: Sincere Romantic Compliment (Gated Psychological Trigger) ---');
  const userMsg2 = "Kana, you worked so hard on that stage and you truly shone brighter than anyone. I couldn't take my eyes off you.";
  console.log(`User: "${userMsg2}"\n`);

  const response2 = await gemini.generateReply(
    kana,
    userMsg2,
    [
      { role: 'user', content: userMsg1 },
      { role: 'model', content: response1 }
    ],
    {
      persona: { name: 'Aqua' },
      relationship: relState
    }
  );
  console.log(`Kana Arima Response (Turn 2):\n${response2}\n`);

  console.log('✨ Live validation test complete!');
}

testLiveCharacterGeneration().catch(err => {
  console.error('❌ Live generation test error:', err);
  process.exit(1);
});

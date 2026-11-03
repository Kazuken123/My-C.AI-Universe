import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';

const DATASET_PATH = 'data/training/kana_sft_gemini.jsonl';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is missing from environment.');
    process.exit(1);
  }

  if (!existsSync(DATASET_PATH)) {
    console.error(`Error: Dataset not found at ${DATASET_PATH}. Run "node scripts/eval/prepare-fine-tuning-data.mjs" first.`);
    process.exit(1);
  }

  const lines = readFileSync(DATASET_PATH, 'utf8').trim().split('\n').map(JSON.parse);
  console.log(`Loaded ${lines.length} fine-tuning examples from ${DATASET_PATH}.`);

  console.log('\n--- Gemini Fine-Tuning Instructions ---');
  console.log('1. Web UI (Google AI Studio - Easiest & Most Visual):');
  console.log('   - Navigate to https://aistudio.google.com/tune');
  console.log('   - Click "Create Tuned Model".');
  console.log('   - Select base model: "Gemini 1.5 Flash" or "Gemini 1.5 Pro".');
  console.log(`   - Upload dataset file: "${DATASET_PATH}".`);
  console.log('   - Set Epochs: 4, Learning Rate Multiplier: 1.0.');
  console.log('   - Click "Tune". Google cloud will train the model in ~15-30 minutes for free.');
  console.log('\n2. Programmatic API:');
  console.log('   - Use the dataset with the Google GenAI SDK tunings API:');
  console.log('     const ai = new GoogleGenAI({ apiKey });');
  console.log('     // ai.tunings.tune(...)');
  console.log('\nOnce trained, set the resulting model ID in your .env:');
  console.log('GEMINI_MODEL=tunedModels/your-kana-model-id');
}

main().catch(console.error);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const { ModalGemmaProvider, modalGemmaProvider } = await import('../backend/ai/providers/modalGemma.js');
const { BaseAIProvider } = await import('../backend/ai/providers/BaseAIProvider.js');
const { AIOrchestrator } = await import('../backend/ai/index.js');
const { normalizeProviderName } = await import('../backend/ai/providerSelection.js');

test('1. prepare_gemma4_data generates valid thinking datasets with 4-part thoughts', () => {
  const sftPath = path.join(rootDir, 'cloud_training', 'gemma4_sft.jsonl');
  const dpoTrainPath = path.join(rootDir, 'cloud_training', 'gemma4_dpo_train.jsonl');
  const dpoEvalPath = path.join(rootDir, 'cloud_training', 'gemma4_dpo_eval.jsonl');

  assert.ok(existsSync(sftPath), 'SFT dataset must exist');
  assert.ok(existsSync(dpoTrainPath), 'DPO train dataset must exist');
  assert.ok(existsSync(dpoEvalPath), 'DPO eval dataset must exist');

  const sftLines = readFileSync(sftPath, 'utf8').trim().split('\n');
  assert.ok(sftLines.length >= 10, 'SFT dataset must have >= 10 turns');

  const firstSft = JSON.parse(sftLines[0]);
  const assistantMsg = firstSft.messages.find(m => m.role === 'assistant');
  assert.ok(assistantMsg, 'Assistant turn must exist');
  assert.ok(assistantMsg.content.includes('<thought>'), 'Assistant turn must start with <thought>');
  assert.ok(assistantMsg.content.includes('Emotional State:'), 'Thought must track Emotional State');
  assert.ok(assistantMsg.content.includes('Hidden Subtext:'), 'Thought must track Hidden Subtext');
  assert.ok(assistantMsg.content.includes('Sensory & Scene Anchor:'), 'Thought must track Sensory & Scene Anchor');
  assert.ok(assistantMsg.content.includes('Recalled Memory:'), 'Thought must track Recalled Memory');
  assert.ok(assistantMsg.content.includes('</thought>'), 'Thought block must close properly');

  const dpoLines = readFileSync(dpoTrainPath, 'utf8').trim().split('\n');
  assert.ok(dpoLines.length >= 50, 'DPO train dataset must have >= 50 pairs');
  const firstDpo = JSON.parse(dpoLines[0]);
  const chosenText = firstDpo.chosen[0].content;
  assert.ok(chosenText.includes('<thought>'), 'DPO chosen must include <thought>');
  assert.ok(chosenText.includes('</thought>'), 'DPO chosen must close </thought>');
});

test('2. kaggle_unsloth_gemma4.py strictly enforces Gemma 4 thinking specs and Kaggle disk cap', () => {
  const pyPath = path.join(rootDir, 'cloud_training', 'kaggle_unsloth_gemma4.py');
  assert.ok(existsSync(pyPath), 'Kaggle training script must exist');
  const pyCode = readFileSync(pyPath, 'utf8');

  // Verify Gemma 4 model and vision disabling
  assert.ok(pyCode.includes('unsloth/gemma-4-12B-it'), 'Must target Gemma 4');
  assert.ok(pyCode.includes('finetune_vision_layers = False'), 'Must disable vision layers');

  // Verify chat template and duplicate bos removal
  assert.ok(pyCode.includes('chat_template="gemma-4-thinking"'), 'Must use gemma-4-thinking template');
  assert.ok(pyCode.includes(".removeprefix('<bos>')") || pyCode.includes('.removeprefix("<bos>")'), 'Must remove duplicate <bos>');

  // Verify response-only loss masking
  assert.ok(pyCode.includes('train_on_responses_only'), 'Must use train_on_responses_only');
  assert.ok(pyCode.includes('instruction_part="<|turn>user\\n"'), 'Must mask user turns');
  assert.ok(pyCode.includes('response_part="<|turn>model\\n"'), 'Must compute loss on model turns');

  // Verify direct Hub upload to avoid Kaggle 20GB disk cap
  assert.ok(pyCode.includes('push_to_hub_merged'), 'Must push merged LoRA to Hugging Face');
  assert.ok(pyCode.includes('push_to_hub_gguf'), 'Must push 4-bit GGUF directly to Hugging Face');
});

test('3. modal_gemma4_server.py configures scale-to-zero serverless endpoint with OpenAI compatibility', () => {
  const modalPath = path.join(rootDir, 'cloud_training', 'modal_gemma4_server.py');
  assert.ok(existsSync(modalPath), 'Modal server script must exist');
  const modalCode = readFileSync(modalPath, 'utf8');

  assert.ok(modalCode.includes('scaledown_window=300'), 'Must shut down after 5 mins idle for scale-to-zero billing');
  assert.ok(modalCode.includes('/v1/chat/completions'), 'Must expose /v1/chat/completions');
  assert.ok(modalCode.includes('/health'), 'Must expose /health endpoint');
  assert.ok(modalCode.includes('MODAL_API_KEY'), 'Must require Bearer token auth');
  assert.ok(modalCode.includes('SamplingParams'), 'Must configure vLLM sampling parameters');
});

test('4. ModalGemmaProvider extends BaseAIProvider with multi-turn history sanitization and Gemma 4 parameters', () => {
  assert.ok(modalGemmaProvider instanceof BaseAIProvider, 'Must inherit from BaseAIProvider');
  assert.strictEqual(modalGemmaProvider.providerName, 'modal_gemma');

  // Verify provider registration in orchestrator
  const orchestrator = new AIOrchestrator();
  assert.ok(orchestrator.providers.has('modal_gemma'), 'AIOrchestrator must have modal_gemma registered');
  assert.strictEqual(normalizeProviderName('modal_gemma'), 'modal_gemma');

  // Verify buildMessages sanitizes history: past thoughts must NOT be passed to future turns
  const character = { name: 'Kana Arima', personality: 'Tsundere center.' };
  const memory = [
    { role: 'user', content: 'Hello Kana!' },
    { role: 'assistant', content: '<thought>\nEmotional State: Guarded\n</thought>\n\nKana Arima: "What do you want?"' }
  ];

  // Access private #buildMessages via prototype / reflection or testing generateReply payload
  const messages = modalGemmaProvider['#buildMessages']
    ? modalGemmaProvider['#buildMessages'](character, 'Are you ready?', memory)
    : null;

  const providerCode = readFileSync(path.join(rootDir, 'backend', 'ai', 'providers', 'modalGemma.js'), 'utf8');
  assert.ok(providerCode.includes('temperature: typeof options?.temperature === \'number\' ? options.temperature : 1.0'), 'Default temperature must be 1.0');
  assert.ok(providerCode.includes('top_p: typeof options?.top_p === \'number\' ? options.top_p : 0.95'), 'Default top_p must be 0.95');
  assert.ok(providerCode.includes('top_k: typeof options?.top_k === \'number\' ? options.top_k : 64'), 'Default top_k must be 64');
  assert.ok(providerCode.includes('(?:thought|subtext)'), 'Must strip historical thoughts from memory turns');
});

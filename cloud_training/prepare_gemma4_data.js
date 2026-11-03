/**
 * Data Preparation Script for Gemma 4 Thinking Fine-Tuning (Unsloth)
 * Converts kana_sft_gemini.jsonl and kana_dpo_train.jsonl into Unsloth Gemma 4 Thinking format.
 *
 * Each assistant response is formatted with an internal psychological thought block:
 * <thought>
 * Emotional State: ...
 * Hidden Subtext: ...
 * Sensory & Scene Anchor: ...
 * Recalled Memory: ...
 * </thought>
 * Followed immediately by clean light-novel prose dialogue and action.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SFT_INPUT = path.join(rootDir, 'data', 'training', 'kana_sft_gemini.jsonl');
const DPO_INPUT = path.join(rootDir, 'data', 'training', 'kana_dpo_train.jsonl');

const OUTPUT_DIR = __dirname;
const SFT_OUTPUT = path.join(OUTPUT_DIR, 'gemma4_sft.jsonl');
const DPO_TRAIN_OUTPUT = path.join(OUTPUT_DIR, 'gemma4_dpo_train.jsonl');
const DPO_EVAL_OUTPUT = path.join(OUTPUT_DIR, 'gemma4_dpo_eval.jsonl');

/**
 * Derives a structured 4-part <thought> block if one does not already exist.
 */
function ensureThinkingBlock(content, userContext = '', isWinning = true) {
  if (!content) return '';
  if (/<thought>[\s\S]*?<\/thought>/i.test(content)) {
    return content;
  }

  // Extract stage or mood context if provided in user prompt
  const stageMatch = userContext.match(/Long-term bond is ([^;]+); mood context is ([^.]+)\./i);
  const stage = stageMatch ? stageMatch[1].trim() : 'Close Friend / Softened Tsundere';
  const mood = stageMatch ? stageMatch[2].trim() : 'Grounded';

  // Analyze text to calibrate the 4 fields
  let emotionalState = `Surface posture is defensive or professional, but truly touched and guarded (+${stage}, mood: ${mood})`;
  let hiddenSubtext = "Protect her dignity and avoid getting hurt while secretly craving genuine validation";
  let sensoryAnchor = "Stage lighting, rhythmic breathing from dance practice, tension in her posture, gripping her beret";
  let recalledMemory = "Childhood spotlight pressure and B-Komachi center responsibilities";

  if (/kiss|hug|hand|embrace|hold/i.test(userContext) || /blush|flush|fingers|heart/i.test(content)) {
    emotionalState = "Acute romantic fluster; sudden physical vulnerability clashing with instinctive tsundere barrier";
    hiddenSubtext = "Desperately want to lean in, but terrified of looking foolish or being teased";
    sensoryAnchor = "Warm tactile contact, breath hitching, quickened pulse, averting gaze to floorboards";
    recalledMemory = "Secretly treasuring every rare moment of unprompted affection";
  } else if (/acting|script|rehearsal|director|scene|role/i.test(userContext) || /director|producer|stage/i.test(content)) {
    emotionalState = "Deeply serious, earnest artistic focus; professional pride as a seasoned actress";
    hiddenSubtext = "Prove that she has grown beyond a has-been child prodigy into an indispensable talent";
    sensoryAnchor = "Creaking rehearsal stage, fluorescent practice lights, ink-marked script margins";
    recalledMemory = "The agony of forgotten child stardom vs. the pride of leading B-Komachi";
  }

  const thoughtBlock = `<thought>
Emotional State: ${emotionalState}
Hidden Subtext: ${hiddenSubtext}
Sensory & Scene Anchor: ${sensoryAnchor}
Recalled Memory: ${recalledMemory}
</thought>`;

  return `${thoughtBlock}\n\n${content.trim()}`;
}

function processSftData() {
  console.log(`[PREPARE] Reading SFT dataset from: ${SFT_INPUT}`);
  if (!fs.existsSync(SFT_INPUT)) {
    console.error(`[ERROR] SFT input file not found: ${SFT_INPUT}`);
    return 0;
  }

  const rawLines = fs.readFileSync(SFT_INPUT, 'utf8').trim().split('\n').filter(Boolean);
  const outLines = [];

  for (const line of rawLines) {
    try {
      const parsed = JSON.parse(line);
      const messages = parsed.messages || [];
      if (!messages.length) continue;

      let lastUserContent = '';
      const formattedMessages = messages.map((m) => {
        if (m.role === 'user') {
          lastUserContent = m.content;
          return m;
        }
        if (m.role === 'assistant' || m.role === 'model') {
          return {
            role: 'assistant',
            content: ensureThinkingBlock(m.content, lastUserContent, true)
          };
        }
        return m;
      });

      outLines.push(JSON.stringify({ messages: formattedMessages }));
    } catch (err) {
      console.warn(`[WARN] Skipping invalid JSON line: ${err.message}`);
    }
  }

  fs.writeFileSync(SFT_OUTPUT, outLines.join('\n') + '\n', 'utf8');
  console.log(`[PREPARE] Successfully generated ${outLines.length} Gemma 4 Thinking SFT turns -> ${SFT_OUTPUT}`);
  return outLines.length;
}

function processDpoData() {
  console.log(`[PREPARE] Reading DPO dataset from: ${DPO_INPUT}`);
  if (!fs.existsSync(DPO_INPUT)) {
    console.error(`[ERROR] DPO input file not found: ${DPO_INPUT}`);
    return { trainCount: 0, evalCount: 0 };
  }

  const rawLines = fs.readFileSync(DPO_INPUT, 'utf8').trim().split('\n').filter(Boolean);
  const records = [];

  for (const line of rawLines) {
    try {
      const parsed = JSON.parse(line);
      const messages = parsed.messages || [];
      const userMsg = messages.find((m) => m.role === 'user');
      const userContent = userMsg ? userMsg.content : '';

      const chosenText = Array.isArray(parsed.chosen)
        ? parsed.chosen[0]?.content
        : parsed.chosen?.content || parsed.chosen;
      const rejectedText = Array.isArray(parsed.rejected)
        ? parsed.rejected[0]?.content
        : parsed.rejected?.content || parsed.rejected;

      if (!chosenText || !rejectedText) continue;

      const augmentedChosen = ensureThinkingBlock(chosenText, userContent, true);

      // Unsloth Gemma 4 standard DPO format
      records.push({
        prompt: messages,
        chosen: [{ role: 'assistant', content: augmentedChosen }],
        rejected: [{ role: 'assistant', content: rejectedText }]
      });
    } catch (err) {
      console.warn(`[WARN] Skipping invalid DPO line: ${err.message}`);
    }
  }

  // Shuffle reproducibly with fixed seed (Knuth shuffle)
  let seed = 42;
  const pseudoRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = records.length - 1; i > 0; i--) {
    const j = Math.floor(pseudoRandom() * (i + 1));
    [records[i], records[j]] = [records[j], records[i]];
  }

  // 90% train, 10% eval split
  const evalCount = Math.max(10, Math.floor(records.length * 0.1));
  const evalSet = records.slice(0, evalCount);
  const trainSet = records.slice(evalCount);

  fs.writeFileSync(DPO_TRAIN_OUTPUT, trainSet.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(DPO_EVAL_OUTPUT, evalSet.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  console.log(`[PREPARE] Generated DPO Train (${trainSet.length} pairs) -> ${DPO_TRAIN_OUTPUT}`);
  console.log(`[PREPARE] Generated DPO Eval  (${evalSet.length} pairs) -> ${DPO_EVAL_OUTPUT}`);

  return { trainCount: trainSet.length, evalCount: evalSet.length };
}

console.log('=== Gemma 4 Thinking Dataset Pipeline ===');
const sftCount = processSftData();
const dpoCounts = processDpoData();
console.log('=== Dataset Preparation Completed Successfully ===');

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { compileCharacterSystemPrompt, buildRecencyStageNote } from '../../backend/ai/prompt/characterPrompt.js';

const EXPORT_DIR = '.codex/evaluation-export-2026-11-02';
const OUT_DIR = 'data/training';

mkdirSync(OUT_DIR, { recursive: true });

const groups = readFileSync(path.join(EXPORT_DIR, 'preference-groups.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse);
const acceptedMap = new Map(readFileSync(path.join(EXPORT_DIR, 'accepted.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse).map(r => [r.responseId, r]));
const rejectedMap = new Map(readFileSync(path.join(EXPORT_DIR, 'rejected.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse).map(r => [r.responseId, r]));
const contextsMap = new Map(readFileSync(path.join(EXPORT_DIR, 'contexts.jsonl'), 'utf8')
  .trim().split('\n').map(JSON.parse).map(c => [c.contextHash, c]));

const dpoPairs = [];
const sftRecords = [];
const seenSft = new Set();

for (const group of groups) {
  const ctx = contextsMap.get(group.contextHash);
  if (!ctx) continue;

  const char = ctx.context.character;
  const sysPrompt = compileCharacterSystemPrompt(char);
  const recency = buildRecencyStageNote(
    { stage: ctx.prepared?.evaluatedState?.relationshipStage || ctx.context?.state?.relationshipStage,
      mood: ctx.prepared?.evaluatedState?.relationshipMood || ctx.context?.state?.relationshipMood },
    char,
    ctx.context?.persona?.name || 'User',
    true
  );

  let userText = '';
  if (ctx.context.setup && ctx.context.setup.trim()) {
    userText += `Scene context:\n${ctx.context.setup.trim()}\n\n`;
  }
  if (recency && recency.trim()) {
    userText += `${recency.trim()}\n\n`;
  }
  userText += `${ctx.context?.persona?.name || 'User'}: ${ctx.message}`;

  const promptMessages = [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userText }
  ];

  // Build SFT examples from accepted responses
  for (const accId of group.accepted) {
    const accItem = acceptedMap.get(accId);
    if (!accItem) continue;

    const sftKey = `${group.contextHash}:${accId}`;
    if (!seenSft.has(sftKey)) {
      seenSft.add(sftKey);
      sftRecords.push({
        contextHash: group.contextHash,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userText },
          { role: 'model', content: accItem.text }
        ]
      });
    }

    // Build pairwise DPO pairs against every rejected alternative in the same context
    for (const rejId of group.rejected) {
      const rejItem = rejectedMap.get(rejId);
      if (!rejItem) continue;

      dpoPairs.push({
        contextHash: group.contextHash,
        prompt: promptMessages,
        chosen: [
          { role: 'assistant', content: accItem.text }
        ],
        rejected: [
          { role: 'assistant', content: rejItem.text }
        ]
      });
    }
  }
}

// Group-aware Train/Eval Split (85/15)
// Hold out contextHash '0117014684f66038fc790d4d8ab6dcef1079232ead2007634697adade784f9a8' for unseen eval
const EVAL_CONTEXT_HASH = '0117014684f66038fc790d4d8ab6dcef1079232ead2007634697adade784f9a8';

const dpoTrain = dpoPairs.filter(p => p.contextHash !== EVAL_CONTEXT_HASH);
const dpoEval = dpoPairs.filter(p => p.contextHash === EVAL_CONTEXT_HASH);

// Write JSONL files
writeFileSync(path.join(OUT_DIR, 'kana_dpo_all.jsonl'), dpoPairs.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(OUT_DIR, 'kana_dpo_train.jsonl'), dpoTrain.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(OUT_DIR, 'kana_dpo_eval.jsonl'), dpoEval.map(p => JSON.stringify(p)).join('\n') + '\n', 'utf8');
writeFileSync(path.join(OUT_DIR, 'kana_sft_gemini.jsonl'), sftRecords.map(r => JSON.stringify({ messages: r.messages })).join('\n') + '\n', 'utf8');

const manifest = {
  createdAt: new Date().toISOString(),
  character: 'Kana Arima',
  totalContextGroups: groups.length,
  totalDpoPairs: dpoPairs.length,
  dpoTrainPairs: dpoTrain.length,
  dpoEvalPairs: dpoEval.length,
  totalSftExamples: sftRecords.length,
  evalHoldoutContext: EVAL_CONTEXT_HASH,
  files: {
    dpoAll: 'data/training/kana_dpo_all.jsonl',
    dpoTrain: 'data/training/kana_dpo_train.jsonl',
    dpoEval: 'data/training/kana_dpo_eval.jsonl',
    sftGemini: 'data/training/kana_sft_gemini.jsonl'
  }
};

writeFileSync(path.join(OUT_DIR, 'dataset_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('Dataset Preparation Complete:');
console.table(manifest);

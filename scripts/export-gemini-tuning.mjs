import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = 'data/training/kana_dpo_train.jsonl';
const outputPath = 'data/training/gemini_tuning_kana_full.jsonl';

const lines = readFileSync(inputPath, 'utf8').trim().split('\n').filter(Boolean);
const geminiRecords = [];

for (const line of lines) {
  try {
    const data = JSON.parse(line);
    const messages = [];

    // System prompt & user messages from prompt array
    if (Array.isArray(data.prompt)) {
      for (const m of data.prompt) {
        if (!m || !m.content) continue;
        const role = m.role === 'system' ? 'system' : (m.role === 'assistant' ? 'model' : 'user');
        messages.push({ role, content: String(m.content).trim() });
      }
    }

    // Target assistant response from 'chosen'
    let chosenText = '';
    if (typeof data.chosen === 'string') {
      try {
        const parsed = JSON.parse(data.chosen);
        chosenText = Array.isArray(parsed) ? parsed[0]?.content : (parsed?.content || data.chosen);
      } catch {
        chosenText = data.chosen;
      }
    } else if (Array.isArray(data.chosen)) {
      chosenText = data.chosen[0]?.content || '';
    } else if (data.chosen && typeof data.chosen === 'object') {
      chosenText = data.chosen.content || '';
    }

    if (chosenText && chosenText.trim()) {
      messages.push({ role: 'model', content: chosenText.trim() });
    }

    if (messages.length >= 2) {
      geminiRecords.push({ messages });
    }
  } catch (e) {}
}

writeFileSync(outputPath, geminiRecords.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`Successfully exported ${geminiRecords.length} records to ${outputPath}`);

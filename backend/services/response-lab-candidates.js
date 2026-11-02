import { randomUUID } from 'node:crypto';
import { relationshipService } from './relationship.service.js';
import { generateCharacterPrompt } from '../ai/prompt/characterPrompt.js';

// Validate the entire provider result before exposing any rateable candidate.
export function parseLabCandidates(rawReply, { character, provider, model, options, arm, prior = [], comparison = false, started }) {
  const result = JSON.parse(rawReply);
  if (!Array.isArray(result.alternatives) || result.alternatives.length !== 5) throw new Error('Incomplete batch');
  const seen = new Set(prior.map(x => x.text.trim().toLowerCase()));
  return result.alternatives.map((item, index) => {
    if (typeof item?.move !== 'string' || !item.move.trim() || item.move.length > 500 ||
        !Array.isArray(item.paragraphs) || item.paragraphs.length < (arm === 'character-v1' ? 2 : 4) || item.paragraphs.length > (arm === 'character-v1' ? 12 : 7)) throw new Error('Invalid alternative');
    if (item.paragraphs.filter(p => p?.kind === 'narration').length < (arm === 'character-v1' ? 1 : 2) ||
        !item.paragraphs.some(p => p?.kind === 'dialogue')) throw new Error('Missing narration or dialogue');
    const reply = item.paragraphs.map(paragraph => {
      if (!['narration', 'dialogue'].includes(paragraph?.kind)) throw new Error('Invalid paragraph');
      if (arm !== 'character-v1' && paragraph.kind === 'narration' && (!Array.isArray(paragraph.sentences) || paragraph.sentences.length < 2 ||
          paragraph.sentences.length > 3 || paragraph.sentences.some(s => typeof s !== 'string' || !s.trim()))) throw new Error('Incomplete narration');
      const prose = paragraph.kind === 'narration' && arm !== 'character-v1' ? paragraph.sentences.join(' ') : paragraph.content;
      if (typeof prose !== 'string' || prose.length > 5000) throw new Error('Invalid paragraph');
      const { cleanText } = relationshipService.extractAndStripStateTag(prose);
      let content = cleanText.replace(/\s*\n\s*/g, ' ').replace(/^\*+|\*+$/g, '').trim();
      if (paragraph.kind === 'dialogue') {
        if (content.startsWith(`${character.name}:`)) content = content.slice(character.name.length + 1).trim();
        if (content.startsWith('"') && content.endsWith('"')) content = content.slice(1, -1).trim();
      }
      if (!content) throw new Error('Empty paragraph');
      return paragraph.kind === 'narration' ? `*${content}*` : `${character.name}: "${content}"`;
    }).join('\n\n');
    if (reply.length > 20000) throw new Error('Reply too long');
    const key = reply.trim().toLowerCase(), duplicate = seen.has(key);
    seen.add(key);
    return { id: randomUUID(), status: duplicate ? 'duplicate' : 'complete', text: reply, model, provider,
      ...(comparison ? { promptArm: arm } : {}), approach: arm === 'character-v1' || options.labTournament ? null : options.labAlternatives.approaches[index],
      move: item.move.trim(), ms: Date.now() - started, samplingMode: 'joint',
      temperature: provider === 'gemini' ? 0.95 : null, prompt: generateCharacterPrompt(character, options), options };
  });
}

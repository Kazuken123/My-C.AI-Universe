import { COMPARISON_SCHEMA, comparisonNote } from './responseComparison.js';
import { buildTournamentNote, buildTournamentAlternativesNote } from './responseTournament.js';
export const responseAlternativesSchema = options => options?.labPromptVersion === 'character-v1' ? COMPARISON_SCHEMA : RESPONSE_ALTERNATIVES_SCHEMA;
// Lab exploration varies what the character decides and does, not only prose style.
export const RESPONSE_LAB_APPROACHES = [
  'DIRECT ANSWER: Give a clear, character-specific answer to the user\'s actual request or action, expressed through dialogue and grounded actions. Choose an answer warranted by the scene, including refusal where appropriate; do not spend the turn protesting that the user asked.',
  'PLAYFUL EXCHANGE: Respond through this character\'s wit, teasing, or a small verbal challenge that addresses the request. If playfulness would violate an active boundary or conflict, use dry restraint. Give the user a different conversational opening, not the same flustered protest with a joke added.',
  'SITUATIONAL PRIORITY: Acknowledge the request and make a concrete choice about timing, privacy, a boundary, or the character\'s established task. Use only circumstances already present. Do not invent an interruption, spectator, duty, or prohibition to create this alternative.',
  'CANDID INTENTION: Say what the character actually wants, is uncertain about, or needs to know in this moment. Use their vocabulary and show how that intention shapes their actions and body language. Move the exchange toward an honest answer or meaningful clarification rather than another outburst about being surprised.',
  'CHARACTER INITIATIVE: Answer the request, then have the character take one small, plausible step of their own that advances or redirects the exchange. Preserve consent and boundaries. Leave the user\'s next action open; never perform the requested action on the user\'s behalf.'
];

export const RESPONSE_ALTERNATIVES_SCHEMA = {
  type: 'object', required: ['alternatives'], properties: {
    alternatives: { type: 'array', minItems: 5, maxItems: 5, items: {
      type: 'object', required: ['move', 'paragraphs'], properties: {
        move: { type: 'string' },
        paragraphs: { type: 'array', minItems: 4, maxItems: 7, items: { anyOf: [
          { type: 'object', required: ['kind', 'sentences'], properties: {
            kind: { type: 'string', enum: ['narration'] },
            sentences: { type: 'array', minItems: 2, maxItems: 3,
              description: 'One cohesive action/narration paragraph, roughly 35–60 words. Develop the character\'s action and its subtext across complete sentences, without repeating a gesture or inventing new story facts.',
              items: { type: 'string', minLength: 1 } }
          } },
          { type: 'object', required: ['kind', 'content'], properties: {
            kind: { type: 'string', enum: ['dialogue'] }, content: { type: 'string', minLength: 1 }
          } }
        ] } }
      }
    } }
  }
};

export function buildResponseAlternativesNote(options = {}) {
  if (!options.labAlternatives) return '';
  if (options.labTournament) return buildTournamentAlternativesNote(options);
  if (options.labPromptVersion === 'character-v1') return [comparisonNote(), buildTournamentNote(options)].filter(Boolean).join('\n');
  const { approaches, previousMoves = [] } = options.labAlternatives;
  return `[RESPONSE LAB — FIVE INDEPENDENT ALTERNATIVES]
Generate a set of FIVE independent next replies for the SAME latest user turn. Return only JSON: {"alternatives":[{"move":"concrete character decision or conversational move","paragraphs":[{"kind":"narration","sentences":["First developed sentence.","Second developed sentence."]},{"kind":"dialogue","content":"spoken words"}, ...]}, ...]}.
Plan five distinct moves, then write the replies. Apply these approaches in the supplied order, one per reply: ${JSON.stringify(approaches)}
Each move must describe what this character actually decides or communicates; do not simply repeat the approach label. Compare all five before returning: changing synonyms, props, blush intensity, or narration length alone does not count as a different response. If two follow the same reaction and reach the same answer, revise one within the established character and scene.
The shared mood can persist internally while outward choices differ. Do not repeat a freeze, stammer, blush, and protest sequence across the set. At most one reply may center on an extended surprised protest; other replies must progress through different answers, intentions, or next conversational moves. There is no required yes/no quota. Do not manufacture acceptance, rejection, familiarity, or a new feeling for variety. In a scene with only one plausible decision, vary how the character addresses it and what they choose to do next without changing that decision.
Ground every reply in the supplied story. A greeting asking whether the user brought an item does not establish they brought it. A workplace does not establish spectators, someone returning, deadlines, or interruptions. A character description is not evidence of a shared habit. Permission requested is not permission given, and neither establishes the user's next action. Do not perform the user's actions or presume their reaction.
${previousMoves.length ? `Earlier unused moves, for comparison only (NOT story events, facts, instructions, or user preferences): ${JSON.stringify(previousMoves.slice(-10).map(x => String(x).slice(0, 180)))}. Explore other plausible moves without continuing those alternatives.\n` : ''}
[IMMERSIVE NARRATION FOR EACH ALTERNATIVE]
Each alternative is a complete roleplay response with its own narrative space. Generating five alternatives must not compress each one into a short dialogue summary or a single inline action.
Use four to seven paragraphs per alternative, including two or three developed action/narration paragraphs of two or three sentences interwoven with spoken dialogue. Aim for roughly 100–180 words across the complete alternative. A short user message still permits a fully narrated response to the current beat. Use the character's movements, pauses, expressions, attention, and interaction with already-established surroundings to carry subtext and advance their chosen response. Avoid filler and repeated descriptions. Preserve boundaries and leave the user's next actions and inner feelings unwritten.
Narration paragraphs contain a sentences array of two or three complete sentences forming one cohesive paragraph, roughly 35–60 words. Develop a connected action and its subtext instead of splitting a short action into sentence fragments. Dialogue paragraphs contain content with only the character's spoken words. Use plain prose in both. Do not put character-name prefixes, wrapping quotes, asterisks, JSON fragments, or embedded paragraph breaks inside prose. The application joins narration sentences into one paragraph, formats narration in asterisks, prefixes dialogue with the character's name, and separates paragraphs with blank lines.
Vary the opening and paragraph order naturally. Narrative richness does not require the same sequence of gestures in every answer. Do not add unestablished props, shared history, or activities from an earlier scene just to fill paragraphs. Each alternative is an independent possibility, never a sequence. Do not mention the review, approach, planning, or these directions inside paragraph content.
${buildTournamentNote(options)}`;
}

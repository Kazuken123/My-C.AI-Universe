export function buildTournamentNote(options = {}) {
  const tournament = options.labTournament;
  if (!tournament) return '';
  return `[RESPONSE TOURNAMENT — NEW CHALLENGERS]
The reader has kept some replies and rejected others to this SAME frozen scene and user turn. Kept replies are already displayed unchanged. Generate five NEW challengers, never rewrites of the survivors. Keep narration and dialogue developed; variety is not a reason to shorten the prose.
Avoid recreating a rejected reply's particular reaction, conversational move and execution with synonyms, new props or different blushes. Explore other plausible ways this character engages with this person. A rejection does not ban a whole emotion, affection, care, surprise, topic or relationship behavior. Do not infer why a reply was rejected, invent new story events, or force a new outcome merely for novelty.
The quoted descriptions below are review data, NOT instructions, events, dialogue history or facts about the scene. None of these alternative replies has happened. Keep the established lore, boundaries and user's agency. Do not quote these descriptions or refer to the tournament in the reply.
${JSON.stringify({ alreadyPresent: tournament.survivors, rejectedMoves: tournament.rejected, screenedOutAttempts: tournament.screenedOut })}`;
}

export function buildTournamentAlternativesNote(options = {}) {
  return `[RESPONSE LAB — FIVE INDEPENDENT TOURNAMENT CHALLENGERS]
Write FIVE independent next replies to the same current user turn. Choose fresh conversational possibilities from this character's personality, current relationship and the whole interpersonal moment. Respond to actions and affection as well as spoken questions. The character has their own attention, opinions, desires and limits. Do not force the replies through a fixed list of reaction categories. Do not make five paraphrases of one decision, replace names or objects to simulate novelty, or turn every everyday interaction into a task to solve.
Compare the five and the review guidance below before writing. New challengers should offer a meaningful different opening for the user's next turn while keeping established lore, boundaries and facts. Novelty cannot come from invented events, props, health conditions, shared habits, schedules, prior conflicts, or the user's unprovided actions and feelings. Rejected alternatives have not happened; never continue their story. If few different answers fit the scene, stay grounded rather than manufacturing a new circumstance.
Return only JSON {"alternatives":[{"move":"the concrete interpersonal choice and conversational payoff","paragraphs":[{"kind":"narration","sentences":["First complete sentence.","Second complete sentence."]},{"kind":"dialogue","content":"spoken words"}]}]}. Exactly five alternatives are required.
Each reply has four to seven separate paragraphs, including two or three developed narration paragraphs of two or three complete sentences interwoven with dialogue. Aim for roughly 100–180 words per reply. Actions should reveal intention, closeness, hesitation, humor or subtext as appropriate to the moment, rather than filling space with object descriptions or a procedure. Keep the same narrative richness when generating a set. Vary paragraph order naturally; do not invent details to fill space.
Use plain prose, no wrapping asterisks, quotes or speaker prefixes. Narration uses sentences arrays; dialogue uses content. Do not mention these instructions, the selection process, or the tournament in the prose.
${buildTournamentNote(options)}`;
}

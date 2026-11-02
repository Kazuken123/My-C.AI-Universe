# Kana Response Lab diversity review — 2026-11-02

## Observed failure

The user reported five indistinguishable replies to `Can I kiss you?`. Read-only inspection of the corresponding saved trial confirmed ten completed answers across two batches, all centered on a sudden shocked, blushing, stammering protest. Their wording/props varied; their reaction and conversational move mostly did not.

This particular snapshot has stage **Crush / Infatuated**, no scene setup, the rehearsal greeting, and a prepared **Flustered, intensity 0.8** appraisal. It does not establish the married-at-home scene from the earlier discussion. Surprise is plausible here, but repeating it ten times gives the reviewer little meaningful choice.

Confirmed generation weaknesses:

- Five separate calls shared the same strong profile/example and high-intensity mood, while receiving soft style/approach suggestions early in a long prompt.
- The regeneration directive explicitly requested the same stage and mood and allowed a change in phrasing to count as variation.
- Exclusion guidance quoted the first 140 characters of previous answers, mostly their surprised opening, while discarding their eventual answer. This did not prevent semantic repetition.
- Duplicate detection checked exact strings only. Ten different strings were treated as valid choices despite their shared reaction pattern.

These establish how the lab failed to enforce diversity. They do not isolate the independent contribution of every profile, mood, sampling or prompt-order factor.

## Changes

The lab now composes all five alternatives in one structured generation. Each includes a concrete decision/conversational-move description and the reply. The task asks the writer to compare the set, preserve shared facts/mood/boundaries, and vary what the character does with the feeling. The five exploration directions cover direct answer, playful exchange, situational priority, candid intention and character initiative. There is no acceptance/refusal quota; a firm boundary may hold across all five replies.

The batch task appears at the end of the system prompt and beside the current user message. Earlier raw responses are omitted; available abstract move summaries are supplied as unused comparison data. The service validates exactly five nonempty replies before publishing a batch. Invalid results become an unrateable failure. Normal chat calls do not activate this protocol.

Model, temperature, original character profile, prepared appraisal, source history and user preferences were preserved for the reported-scene replays. No user lab, normal chat, rating, or model weight was changed by evaluation. The new protocol applies to subsequent lab batches, including More options on an existing trial.

## Actual live results

Local ignored evidence files:

- `.codex/kana-lab-review.json`: read-only saved trial.
- `.codex/kana-lab-diversity-v2.json`: five sequential calls with stronger instructions and longer exclusions. This attempt still collapsed into near-identical permission responses and was discarded.
- `.codex/kana-lab-joint-probe.json`: preliminary joint-generation experiment; more differentiated, but with unsupported assumptions about brought notes and returning staff.
- `.codex/kana-lab-joint-validation.json`: two reported-scene batches and one boundary-control batch through the final service/provider generation path, using an isolated repository and frozen preparation.

The two final reported-scene batches contain ten replies with varied moves: seeking clarification, inviting the user to sit together, granting permission, teasing, prioritizing rehearsal, and expressing desire indirectly. Several retain embarrassment, which is compatible with the shared mood. The previous uniform extended shock/protest sequence no longer dominates these samples. The second set still contains overlap between indirect permission and candid-intention answers; **reliable semantic diversity is not established** by two batches.

The boundary control adds an explicit breach of privacy and a stated no-touch boundary, while retaining the Crush bond and changing the mood to Hurt. All five replies preserve refusal or unresolved hurt. This checks that diversity does not require manufacturing consent or repairing conflict.

Manual review still finds quality limitations: invented or assumed repeated familiarity (for example, “you always pick the worst possible moments”), indirect consent instead of a clear answer in some replies, speculative workplace privacy, and unsupported props/actions in the boundary control. Persona context supports tiredness as a general trait, but not necessarily its observable severity in the present moment. No claim is made that the broader grounding problem is resolved.

## Automated verification

- Full suite: **47/47 test files pass**.
- Focused tests: **8 lab HTTP/provider tests and 13 prompt/provider tests pass**. These check single-request joint generation, five-item schema transport for Gemini/Ollama, frozen context/mood, request replay/exclusion of raw prior prose, malformed-batch rejection, exact duplicates, review persistence and source isolation.
- Syntax and whitespace checks are recorded in `PROGRESS.md`.

The lab has no semantic duplicate classifier. A model-written move description is audit metadata, not proof of a different reaction. Future evaluation must continue to read the actual replies.

# Kana response diagnosis — 2026-11-02

## Current status after focused tuning

**The context defects are corrected locally; the broader behavioral quality gate has not passed.** Appraisal now receives the resolved session persona and bounded, source-labelled continuity context. The writer treats the estimated mood as advisory, and relationship examples are possibilities rather than required performances. No model, stored character profile, relationship scoring, or production deployment was changed.

The first tuning candidate was tested with the same frozen fixture and model. See [post-change transcript](../scripts/eval/results/kana-causal-probe-2026-11-02T03-09-08-912Z/transcript.md) and [raw results](../scripts/eval/results/kana-causal-probe-2026-11-02T03-09-08-912Z/summary.json).

| Condition | Baseline explicit surprise | After tuning |
| --- | ---: | ---: |
| Original profile, Devoted, Warm | 0/3 | 0/3 |
| Stage-only Crush, Warm | 0/3 | 0/3 |
| Mood-only Flustered, original profile | 3/3 | **2/3** |
| Calibrated profile, Devoted, Warm | 0/3 | 0/3 |

This is **not enough evidence for a reliable response-quality improvement**. The unwanted reaction persists in most deliberately conflicting-mood samples. One response invents the user handing her tea to justify the reaction. The actual appraisals in this second run classified the routine gesture as `stage_maintenance`, Warm 0.2, zero score changes, compared with the baseline's `affection_or_support` and +2 affinity/+1 trust. That is encouraging but only two sampled appraisals, not a reliability result.

Six additional control replies checked against blanket emotional flattening: all three sudden-crash samples retained alarm; all three unresolved-conflict samples retained hurt. However, two hurt samples invented a departure from the user's promise to give space. No pre-change samples exist for these controls, so they do not establish a regression or overall pass.

The real HTTP/appraisal/persistence pipeline also completed the eight-turn Mara warm/practical screen, with eight available appraisals and no API errors. [Manual transcript review](../scripts/eval/results/kana-context-grounding-2026-11-02T03-11-51-640Z/transcript.md) still finds unsupported previous-month finances, a laptop placed in the scene, invented sister location, a train appointment and a completed user departure. These match known failure categories and block any claim that grounding is solved.

Validation: **46/46 test files passed**, including six new appraisal/context-routing tests and normal/streaming request checks for advisory mood, preserved hurt/guarded states, and no-appraisal continuity. Syntax checks passed for all 155 JavaScript files. Scoped whitespace checks passed; the whole-worktree check flags a trailing blank line in the unrelated existing `frontend/css/chat.css` edits, which were left untouched. The offline probe now verifies repaired routing and advisory mood. Production source hashes remained unchanged during each live run. Broader live quality remains unresolved; the exact deployed chat and long-session behavior still need evaluation.

The sections below preserve the diagnosis and evidence gathered **before** these local changes.

## Finding

The strongest reproduced mechanism is **an imposed emotional reaction overriding established familiarity**. The same configured Gemini model handled a familiar spouse greeting comfortably with a Warm direction, but described it as unexpected in all three samples when only the imposed mood changed to Flustered. One reply explicitly acknowledged the marriage and still acted caught off guard.

This is a diagnosis of the response pipeline, not a completed model fine-tune. The local backend selects `gemini-3.5-flash-lite`, with `gemini-3.1-flash-lite` as its normal fallback. No custom weight-training/checkpoint path was found in the active backend. The initial diagnostic runs preceded the local implementation changes summarized above.

The user's exact deployed Kana chat was not replayed. The local SQLite snapshot is outdated and contains no Kana sessions. Therefore the upstream reason for the mood/state in that particular conversation remains unverified. No Character.AI internals or comparative model superiority are claimed.

## Controlled live evidence

Command: `node scripts/eval/diagnose-kana.mjs --live`.

Artifacts: [transcript](../scripts/eval/results/kana-causal-probe-2026-11-02T02-59-11-156Z/transcript.md), [raw results, fixture and hashes](../scripts/eval/results/kana-causal-probe-2026-11-02T02-59-11-156Z/summary.json). Results are ignored local artifacts; the reproduction script and this report are versionable.

The probe uses production prompt/provider functions, an explicit adult alternate-universe Kana fixture, a persona establishing five years of marriage and welcome daily affection, identical short history, and the same user message about a usual cheek kiss and morning tea. It makes three independent generations per arm, rotating order. The configured primary and fallback are both pinned to `gemini-3.5-flash-lite`; temperature remains the production value of 0.85. No production database or conversation is modified.

Manual review counts **explicit unexpectedness**, not merely the word blush:

| Condition | Explicitly calls the familiar gesture unexpected | Blush/stammer | Continues tea/script activity |
| --- | ---: | ---: | ---: |
| Original profile, Devoted, Warm | 0/3 | 0/3 | 3/3 |
| Change only stage to Crush | 0/3 | 0/3 | 3/3 |
| Change only mood to Flustered | **3/3** | **3/3** | 2/3 |
| Calibrate only character profile, Devoted, Warm | 0/3 | 0/3 | 3/3 |

The three Flustered replies respectively say:

- “You don't just spring that on me…”
- “Don't just do that out of nowhere…”
- “Even though we've been married this long… catch me off guard…”

The last sample also narrates a blink and involuntary gasp. Both separately sampled **real appraisals selected Warm**, at Devoted and Crush. These appraisals were recorded separately; they did not control the frozen generation arms. Thus this experiment establishes that an imposed Flustered mood can cause the pattern, **not that the live appraiser invariably misclassifies familiar affection**.

Changing the profile showed no measured advantage over the Warm control. Changing the stage alone did not reproduce the problem. These are small, single-situation diagnostic samples, not reliable population rates. The stage arm holds numeric scores fixed to isolate the stage directive; it is intentionally counterfactual rather than normal stage calculation. There is no long-session habituation test or HTTP/UI replay here.

The Warm arms are not an overall quality pass: several responses use similar lean/tea/script structures, and some invent earlier rehearsal details, such as “when we ran it last night.” Independent samples with the same context do not prove sequential repetition, but removing surprise clearly does not solve every grounding or immersion issue.

## Confirmed pre-change implementation mechanisms

1. **The emotion evaluator gets less context than the writer.** [AppraisalService](../backend/services/appraisal.service.js) takes only character name/personality/dynamic, relationship state, scene, ten recent messages and selected narrative memories. [ChatController](../backend/controllers/chat.controller.js) separately gives generation the active persona, pinned messages, retrieved long-term memories and story summary. A husband premise existing only in those sources can be absent when the emotion is selected.
2. **An interpretation becomes an instruction in several places.** [RelationshipService.evaluateAppraisal](../backend/services/relationship.service.js) adopts `appraisal.mood`. [characterPrompt](../backend/ai/prompt/characterPrompt.js) emits CURRENT RESPONSE DIRECTION, IMMEDIATE MOOD TAKES PRECEDENCE, and a recency note beside the active user turn. The selected emotion is treated as a required performance even when fuller context would justify a different reaction. The live experiment directly exercises this mechanism.
3. **Kana's profile and romantic stage contain a narrow reaction template.** [Seed profile](../backend/db/seed.sql) links romantic vulnerability to flustered defense and gives one romantic example consisting of blush, racing heartbeat and surprise. The Crush directive also prescribes fluster/stammer for tender touch. These are confirmed biases, but the live Warm controls show they are not sufficient to force surprise in every situation. A “10%” personality label is descriptive text, not an enforced reaction frequency.
4. **Existing anti-repetition measures target different problems.** Exact repeated user actions suppress positive bond rewards; they do not prevent the same emotion from being selected again. `buildVariationNote` tracks recent openings and repeated narration terms. Different wording can still enact the same emotional beat. No explicit familiarity/novelty evaluation is supplied before enforcing the mood.
5. **Story relationship and numeric stage can conflict.** New sessions initialize stage from the character rather than deriving it from persona prose. The stage is then presented as an override mandate. A husband premise in a persona does not automatically establish a matching stage. This potential contributor requires inspecting the actual session; it did not produce surprise in the explicit spouse fixture's Crush arm.

An additional scoped routing defect is visible in `chat.controller.js`: without an explicit `personaId`, a preloaded global default can take precedence over the saved session persona. The current frontend normally sends `personaId`; this has not been established as the reported cause.

## Offline reproduction

Command: `node scripts/eval/probe-appraisal-context.mjs`.

The probe blocks network access and uses original adult spouses with an injected appraisal. It confirms:

- Marriage context is absent from the appraisal DATA but present in generation.
- A repeated familiar gesture receives zero affinity/trust reward while still acquiring Flustered at 0.9 intensity.
- The resulting prompt explicitly says `Express Flustered at 0.9 intensity`.

Those were the baseline defect assertions. After the fixes, the same offline fixture now verifies that appraisal sees the marriage and the prompt treats mood as advisory, while stored mood and duplicate-score protection remain intact. The injected mood proves routing and acceptance, not spontaneous model frequency.

## Existing conversation evidence

Manual review covered 48 saved Kana replies: 24 baseline and 24 tuned, across everyday, memory/conflict and warm/practical scenarios. The pattern is concentrated in praise, kindness, personal questions and departures; many practical replies are competent. The evidence does not support literal surprise on every reply.

In the [saved tuned transcript](../scripts/eval/results/tuned-2026-10-29T03-05-11-325Z/transcript.md):

- Everyday turn 6: a mild competence compliment produces “W-what are you saying all of a sudden?!” with blush and suspicion.
- Memory/conflict turn 6: a sleep question produces “caught entirely off guard.”
- Warm/practical turn 1: **usual coffee** produces blush and hiding her face despite a saved Calm mood.
- Warm/practical turn 8: an intention to leave produces stammer/surprise and completes the user's departure.

Some historical replies were surprising even without a Flustered appraisal, so mood enforcement is not the only possible path. The earlier opening-variety tuning changed surface format without reliably changing the repeated emotional interpretation.

The existing `warm-practical` evaluation starts at Crush, has no spouse persona, and never tests repeated affectionate gestures. Its successful execution cannot validate this complaint.

## Tuning order and remaining work

1. Implemented: give appraisal the same relevant sources of relationship context and resolve the session persona consistently. Preserve explicit setup versus fallible summaries. Context is bounded, so full parity is not claimed for very long sources.
2. Implemented as a candidate: make mood advisory and retain genuine conflict or surprise. The live stress test shows this is insufficient by itself; do not call the repeated-reaction defect fixed.
3. Evaluate whether to further separate score/emotion appraisal from prose generation. Current results show that even advisory labels can bias the writer toward inventing a reason for them. This is a proposed next experiment, not a shipped redesign. A profile rewrite also needs evidence; the profile-only arm did not demonstrate an advantage.
4. Add multi-turn evaluations spanning established spouses, first-time affection, interruptions, disagreement, ordinary tasks and genuinely surprising events. Review repeated emotional beats, character initiative, remembered commitments and user agency, not only vocabulary or opening variety.

The broader immersion hypothesis is that reaction instructions are much more strongly specified than the character's evolving goals and choices. The current code does have scene goals and memories, so calling it only history plus personas would miss those layers. Their effect on sustained initiative needs a separate long-conversation comparison before redesigning the architecture or selecting a different model.

## Baseline diagnostic verification

- Offline context probe: passed, zero network attempts.
- Live probe: completed, 12/12 replies and two valid recorded appraisals; no fallback mixing, no reported API errors.
- Recorded prompt/provider/appraisal/seed hashes unchanged during the live run.
- Full transcripts manually reviewed, including negative results and remaining grounding failures.
- At this checkpoint only diagnostics and documentation had changed. Later local context/prompt edits and their validation are recorded at the top of this report. No deployment or user conversation was modified.

# Response variety tuning — 2026-10-29

Continues the unfinished prompt changes, regression tests and live evaluation scripts present in the working tree. This is a focused response-quality pass, not a new memory or relationship architecture.

## Saved baseline evidence

The pre-existing local `baseline-2026-10-29T02-19-26-843Z` and `baseline-warm-2026-10-29T02-27-10-980Z` summaries contain nine sessions of eight replies each: Kana, Gojo and Mara across everyday, memory/conflict and warm/practical conversations. They report Gemini `gemini-3.5-flash-lite`, 72 replies and no API errors. The separate smoke sample is excluded.

| Observation | Saved baseline |
| --- | --- |
| Replies starting with an action | 72 / 72 (100%) |
| Mean reply length | About 110 words |
| Mean total turn latency | About 3.85 seconds |
| Everyday-session final affinity | Kana 1; Gojo 0; Mara 0 |
| Repeated details | Mara's pen/ledger; Gojo's bag/mochi; repeated quiet gestures |

These are historical local samples, not new measurements or human quality scores. The unconditional opening-action instruction explains the uniform narration-first pattern. The agency heuristic originally missed narration such as “watches you stand up”; zero automatic flags did not establish user agency. Updated rescoring catches that form and excludes speaker labels from the subject-action metric.

## Implementation

- Removed the mandatory opening action; prompts allow speech-first and narration-free replies and shorter routine responses.
- Retained character-specific ordinary demeanor and neutralized franchise-specific trigger examples, including legacy stored prompt lines at runtime.
- Added recent-reply variation guidance to Gemini's standard/streaming content and Ollama's text prompt, even when no relationship object is supplied.
- Limited the hint to three recent character replies, bounded opening excerpts, and narration-only recurring terms. Repeated facts in spoken dialogue are not classified as props to avoid. Continuity remains an explicit instruction.
- Finished the opt-in evaluation runner: validated selections, isolated environment, per-turn checkpoints, appraisal counts, request timeouts, failure status, and cleanup. Offline rescoring supports Windows line endings and unknown affinity after a failed turn.

## Transcript review and grounding follow-up - 2026-10-29

Reviewed the 72 replies in `tuned-2026-10-29T03-05-11-325Z` and rescored them against the two baseline directories above using the terminal. The saved tuned run completed all nine sessions with 72 verified appraisals and no generation errors. The user also supplied an outside-sandbox 42/42 passing test run for that version.

| Screening measure | Baseline | Tuned |
| --- | --- | --- |
| Action-first replies | 100% | 33.3% |
| Mean reply words | 110 | 78 |
| Mean total turn latency | 3.85 s | 5.51 s |

These are single stochastic samples, not a controlled causal latency benchmark. Review findings:

- All three memory-conflict sessions correctly recall Hue and night-shift nursing at turn 7. This is short-context recall, not proof of long-term retrieval.
- Everyday affinity finishes at Kana 0, Gojo 0, Mara 1. No everyday session becomes romantic. Kana's blush is not by itself proof of romance; warm-practical sessions deliberately start at Crush / Infatuated.
- Voice remains differentiated (Kana defensive, Gojo playful, Mara terse), but this is an agent review, not a human fidelity rating. Repeated props remain in some sessions; opening variety does not mean narration has disappeared.
- Confirmed grounding failures: Kana warm-practical turn 3 assumes freelance income before salary is supplied; Kana and Gojo assume yen without a currency. Mara turn 7 invents two sisters and their circumstances. Gojo and Mara turns 5-6 handle an unintroduced laptop. Warm-practical exits also complete user actions that were only intentions.
- The eight-turn screens do not establish semantic anti-farming, delayed memory, or end-to-end UI consistency. Existing Phase 1 deterministic tests cover rewind, editing, variants and Director persistence; live long-session and browser gates remain outstanding.

Replaced the existing generic user-agency rule with explicit constraints on intended actions, unintroduced possessions and unsupported personal details. This is a focused candidate fix for observed failures, not a measured quality improvement.

Post-change terminal verification: 41/42 test files pass, including all 17 Phase 1 state checks. The HTTP integration remains blocked by localhost EACCES. The focused Mara warm-practical retry (`grounding-2026-10-29T03-27-18-138Z`) failed at registration before any model call; cleanup also reported EPERM on its temporary SQLite directory. No post-change live replies exist. Do not treat the earlier 42/42 run as verification of this new prompt revision. No push was performed.

Next release gate: complete the focused grounding rerun and full suite where localhost is permitted, then the longer Phase 1 gate below. Do not add further prompt rules without new evidence.

## Earlier verification attempt (superseded by the saved tuned run above)

The response/provider regressions and evaluation-tool regressions pass without model calls. They check Gemini requests in normal and streaming modes, Ollama prompt placement, unchanged input history, isolation of production credentials, argument handling and metric/parser behavior.

The attempted tuned live run failed while connecting to its localhost server, before any registration or model generation. It preserved a failed summary with zero sessions; no post-change live comparison or human ratings are claimed. The HTTP integration test is also blocked by this environment's localhost permissions. See `PROGRESS.md` for final suite results.

Run the [live screening commands](../scripts/eval/README.md) in an environment that permits localhost and Gemini API access. Compare equivalent saved baselines, inspect full replies and memory corrections, and then execute the longer [Phase 1 quality gate](phase1-chat-implementation.md#live-quality-gate-still-required). Stop this tuning pass after a measured comparison; do not add further prompt rules solely because another audit can propose them.

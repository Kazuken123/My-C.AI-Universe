# Phase 1: believable character chat

Implemented in the working tree, October 2026. Phase 1 is the believable conversational core; Phase 2 is embodied 3D interaction, Phase 3 is VR, and Phase 4 is the speculative dream interface. Passing engineering tests does not by itself establish that the characters meet the Phase 1 experience goal.

## What changed

| Area | Behaviour |
| --- | --- |
| Response tuning | Gemini and Ollama can produce a validated structured appraisal before dialogue. The reply uses the same emotion, scene, remembered commitments and computed relationship that will be saved. Character-specific voice replaces the universal cheerful 80/20 baseline. Normal chat no longer asks the reply to score itself. |
| Memory | Facts, episodes, promises and beliefs retain the source user message, variant, exact evidence quote and timestamp. Retrieval selects up to eight notes; each session retains up to 100. Explicit corrections can supersede a retrieved note. The memory drawer exposes evidence and supports forgetting. |
| Emotions | Immediate mood and intensity are separate from enduring affinity, trust and strain. Calm or guarded remains possible at high closeness. The latest event explanation and actual numerical changes accompany the bar. |
| Closeness | Every production appraisal goes through the same passive/repetition/effort/stage gates. Repair can reduce strain and restore trust but cannot award romance points. Missing or malformed appraisal freezes scores. The bar fills away from neutral zero rather than starting half full. |
| Turn integrity | Messages, narrative state, relationship and before/after events commit together with a session revision check. A stale writer gets a conflict instead of overwriting a newer turn or resurrecting a deleted session. |
| History edits | Selected variant text persists alongside displayed content. Edits/swipes invalidate derived state from that point; rewind restores the latest retained checkpoint. Simple edits, swipes, pinning and Director changes retain targeted transactional updates. |
| Regeneration | The latest model turn can be regenerated without additional relationship rewards. Earlier turns must be rewound first. Continuations likewise earn no user-action rewards. |
| Failure recovery | Incomplete/failed generation is not committed. SSE clients require a saved completion event and refresh after interruption instead of automatically posting the same action again. |
| Summaries | Durable message-count checkpoints replace modulo scheduling, so ordinary 25/37/... message histories work. A summary generated from an older session revision is discarded. |
| Director | Stage/mood vocabulary is shared with both frontends. Existing stage aliases normalize to the canonical labels; the React modal resynchronizes when opened. Negative presets retain negative trust. |

## Implementation map

- `backend/services/appraisal.service.js`: provider calls, JSON schema, evidence and value validation.
- `backend/services/relationship.service.js`: production `evaluateAppraisal`; older `evaluateTurn` remains deprecated for historical fixtures, not used by the chat controller.
- `backend/services/turn-state.js`: state snapshots, exact repetition fingerprints, memory provenance/retrieval/corrections.
- `backend/db/migrations/20261028-turn-state.js`: additive, transactional session revision/narrative columns, state events and summary checkpoints; runs during database readiness.
- `backend/repositories/ChatSessionRepository.js`: transactional revision claims and state writes.
- `backend/controllers/chat.controller.js`: appraisal → generation → atomic commit.
- `backend/controllers/memory.controller.js`: owner-scoped sourced notes and persistent forgetting.
- `frontend/js/relationship-contract.js`: canonical vocabulary.
- `tests/phase1-turn-state.test.mjs`: isolated regression scenarios.

## Validation recorded

- All 17 new Phase 1 regressions pass, including correction, memory privacy/forgetting, stale writes, rollback, rewind, edits, regeneration, continuation, odd-count summaries, stale summary rejection and SSE failure/completion handling.
- Full `npm test`: 39/40 test files passed. The remaining HTTP integration file cannot connect to its own loopback test server in this sandbox (`connect EACCES 127.0.0.1`), before testing the application routes.
- Next.js TypeScript check, production build and all 14 frontend tests pass. Build emits the existing stylesheet warning in `app/layout.tsx`.
- JavaScript syntax check passes. Graphify was refreshed locally (2084 nodes / 4426 edges at the refresh); some community names fall back to hub names until a separate semantic labeling run.
- Visual preview was prepared from the real React header and built CSS, but browser security policy rejected the local-file URL. Visual review is not claimed.
- Audit repacking was attempted but could not fetch Repomix because registry.npmjs.org DNS access is blocked (ENOTFOUND). Existing audit artifacts were not represented as refreshed.
- No paid model calls, live response ratings, production migration or deployment was performed.

## Live quality gate still required

Use three contrasting profiles (Kana, Gojo, and a reserved original adult character), with at least two sessions per profile:

1. A 20-turn ordinary conversation: identity and speech patterns remain distinct; no automatic romance from routine thanks or passive replies.
2. A meaningful shared event, then paraphrased repetitions: verify score pacing and no farming. Exact normalized repetitions are blocked in code; semantic repetitions depend on appraisal quality.
3. A disagreement and a sincere repair: tension changes independently from enduring closeness.
4. State a fact, correct it later, make a promise, and return after 30 turns: retrieve the corrected fact and commitment without turning beliefs into facts.
5. Regenerate, select an alternate take, edit a source message, rewind, and reload: verify dialogue, memory and bar agree.
6. Review at mobile and desktop widths, including keyboard operation of Director and the memory drawer.

For each session, record provider/model, appraisal availability, time to first token, total turn time and human scores (1–5) for voice fidelity, continuity, emotional plausibility, memory accuracy and user agency. Suggested acceptance gate: all deterministic invariants pass, each quality dimension averages at least 4/5, and no invented user action or unsupported remembered fact in the reviewed sample. These are proposed gates, not measured results.

## Boundaries

- A normal turn adds one appraisal call (12-second timeout) before reply generation. Appraisal failure keeps chat usable with no verified score/memory changes; it can add latency. Model-specific quality and latency remain unmeasured.
- An evidence quote demonstrates provenance, not that the model's interpretation is correct. The user can inspect/delete notes and edit source messages.
- New snapshots cannot reconstruct relationship history before this migration. Editing an earlier turn conservatively rolls state back and invalidates later derived state; it does not silently replay old model calls or rewrite later dialogue.
- Structured notes currently originate in user statements. Character-generated scene developments remain in conversation history and the rolling recap; this is not a full world simulation.
- Long-term notes and checkpoints are per session. Existing intentional global character lore remains separate.
- The project rule forbids pushing when the full test suite is not green. The HTTP test blocker must be resolved and the full suite rerun before release.

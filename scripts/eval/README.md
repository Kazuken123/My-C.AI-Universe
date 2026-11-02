# Live response quality screening

Run explicitly; these scripts are not part of `npm test`. A full run sends 72 character turns across three characters and three scenarios, normally making two Gemini calls per turn. It consumes the configured API quota.

```powershell
npm run eval:chat -- tuned
# Smaller sample
npm run eval:chat -- smoke --only mara --scenario everyday
# Offline comparison of existing run directories (no provider calls)
npm run eval:rescore -- scripts/eval/results/<baseline-directory> scripts/eval/results/<tuned-directory>
```

The runner uses a disposable local SQLite database, seeded Kana and Gojo profiles, and a reserved original adult character, Mara. It reads Gemini credentials/model settings from environment variables first, then `.env`; cloud database, email and administrator credentials are cleared. It does not modify production accounts or conversations. It requires localhost networking and access to the configured Gemini API.

Each turn checkpoints `transcript.md` and `summary.json` under the ignored `results/` directory. JSON includes raw turns, request durations, relationship values, appraisal availability for each turn, and the latest saved narrative state. The run stops with a nonzero exit code on an API failure so missing turns do not silently alter the conversation being compared. The summary records `running`, `failed` or `completed`; completed means execution finished, not that a quality gate passed. An interrupted process may leave a running summary and temporary database.

`EVAL_TURN_SPACING_MS` defaults to 9000; it controls the minimum interval between turn starts. Latency is total HTTP turn time, not time to first token. The model fields name configured primary/fallback models; they do not prove which model served a fallback response. Compare equivalent scenarios and inspect provider logs if fallback occurred.

Metrics are English text heuristics, not quality ratings. Action-first and subject-action rates, repeated content words, punctuation and lexical overlap help locate patterns. Romance terms can be appropriate in context; agency detection can miss invented actions and flag conditional descriptions. Review full transcripts for voice, continuity, memory corrections, emotional plausibility, and user agency. No metric asserts a character is believable or that Phase 1 is complete.

These eight-turn scenarios are short screening samples. The longer conversations, delayed memory recall, state-edit flows, human ratings and mobile/desktop review in [the Phase 1 quality gate](../../docs/phase1-chat-implementation.md#live-quality-gate-still-required) are still required.

See [the tuning handoff](../../docs/response-quality-tuning.md) for baseline findings and current verification limits.

## Kana reaction diagnosis

These opt-in probes investigate the [2026-11-02 repetitive reaction report](../../docs/kana-response-diagnosis-2026-11-02.md). They do not modify production profiles or conversations.

```powershell
# Offline: verifies shared relationship context and advisory mood with an injected appraisal.
node scripts/eval/probe-appraisal-context.mjs
# Offline: save the four controlled prompt conditions, without model calls.
node scripts/eval/diagnose-kana.mjs
# Live: 12 independent generations + 2 appraisal calls, using configured Gemini quota.
node scripts/eval/diagnose-kana.mjs --live
# Add 6 generations checking genuine surprise and unresolved hurt.
node scripts/eval/diagnose-kana.mjs --live --controls
```

The live probe pins fallback to the configured primary, uses a synthetic adult Kana spouse scenario, and changes stage, mood, or profile separately against a frozen Warm control. It saves prompts, raw replies, fixture and source hashes under `results/kana-causal-probe-*/`. Manually judge explicit unexpectedness and continuity; a blush alone is not a failure. These small samples are not a long-session quality benchmark. The offline probe uses the original defect fixture to verify repaired routing without altering stored mood or score semantics.

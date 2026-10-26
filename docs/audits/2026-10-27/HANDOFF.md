# Handoff for GPT-6.1 Sol

**Batch 1 implementation update:** A01 and A02 have now been implemented locally. See [BATCH1.md](BATCH1.md) for validation and rollout notes. The original audit handoff below records the earlier review snapshot; later batches remain outstanding.

## User intent and current stopping point

The user asked for a broad audit of hidden bugs and production risks, then asked to save it so they can switch to GPT-6.1 Sol to handle the fixes. The audit is complete as a review; **the application fixes have not been implemented**.

Read [REPORT.md](REPORT.md). Start with the two P0 issues, not a wholesale rewrite. There are 22 main findings plus smaller follow-ups. Nine mechanisms were reproduced in isolated probes; other findings carry explicit evidence limits.

No application source, repository setting, production data, commit, push, or deployment was changed by this audit. Only six files in this folder were created.

## Snapshot and workspace caution

- Published reference: 84f39dfb7899abe802a4805e4fc9532f87afdd46.
- Local HEAD at audit: 133d7e484b31ec56c11db40f8df7b1950a8918e1.
- Pre-existing changes include .github/workflows/ci-cd.yml, DESIGN.md, docs/CI.md, vanilla UI scripts/styles/pages, Next.js layout/catalog/chat-input/sidebar/hero files, and tests/ui-navigation.test.js. There are also untracked .codex/, .universe-qa/, and universe-scene.js files. Do not discard, stage wholesale, overwrite, or reformat unrelated work.
- Critical cited source matched the GitHub snapshot by content hash. Re-read changed source and git status before implementing; the working tree may advance after this report.
- inventory.json is a snapshot and not a line-by-line coverage claim.
- Agent instructions currently encourage direct main pushes. That is finding A20, not authorization from the user to publish this audit or later fixes.

## First implementation batch

When the user asks to proceed, implement **A01 and A02 only**, with focused regression tests.

### A01: private memory ownership and deletion

Trace:
1. backend/db/schema.sql:128 — session FK sets NULL on deletion.
2. backend/repositories/MemoryRepository.js:28 — NULL means public lore.
3. backend/controllers/memory.controller.js:22 and routes/memory.route.js — public character-memory reads.
4. Session deletion, account deletion, generated-memory creation, explicit memory deletion, Python synchronization.

Design explicit private/global semantics. Choose a migration that retains intentionally public lore and cannot promote private records after parent deletion. Account/session/character deletion and optional Python memory must follow the same privacy rule.

**Do not automatically delete all existing NULL-session memories:** some are intentional public lore and others may be previously orphaned private content. Prepare a reviewed migration/data-repair plan and validate it on a disposable fixture; production data inspection or cleanup is a separate operation.

Required tests:
- Anonymous and user B cannot retrieve user A's memory before or after session deletion.
- The same check after deleting A's account.
- Private facts never enter another user's generation context.
- Intentional public lore remains available.
- Deleted memory cannot return from stale Python retrieval.
- Migration fixture and rollback/recovery behavior.

### A02: queue recovery and validation

Trace:
1. backend/controllers/chat.controller.js:275, 373, 405 — raw provider value accepted.
2. backend/ai/index.js:27, 53 — unchecked toLowerCase before try; processing flag sticks.

Validate provider type/enum before queueing. Ensure each enqueued request resolves or rejects, processing state resets in finally, and one malformed item cannot stop subsequent items. Cover streaming fallback too.

Required tests:
- provider object/number/unknown string -> documented 400 without contacting AI.
- A subsequent valid request completes.
- Throwing primary/fallback providers cannot leave pending requests or locked state.
- Concurrent valid requests preserve intended ordering and settle.
- Deadline/backlog improvements may be a separate A17 batch; avoid silently combining a broad redesign.

## Validation approach

The saved verify-findings.mjs and verify-schema.py are **defect reproduction probes**. Passing means the old mechanism was reproduced. After a fix they may fail by design. Preserve this audit snapshot and add tests asserting the corrected behavior to the normal test suite.

Use isolated tests without real .env, Turso, SMTP, or paid AI credentials. The existing scripts/run-tests.js already creates per-test temporary databases and clears relevant environment variables. Inspect safety before running excluded tests/e2e or manual scripts; do not simply enable them all.

For each implementation batch:
1. Confirm the actual source version and record the intended changed files.
2. Add a regression that fails on the original bug.
3. Implement the smallest coherent repair.
4. Run targeted behavioral tests, then the relevant existing suite through its isolated runner.
5. For frontend changes, run its tests, lint, typecheck, and production build as appropriate.
6. Inspect the final diff for unrelated changes and secrets.
7. Report exact tests, remaining limitations, and migration/rollout needs.

Do not run db:turso:push, db:sync:stats, database resets, or unpinned audit-pack tooling during ordinary validation. Do not request production deployment merely because local tests pass.

## Later batches

| Batch | Findings | Main acceptance goal |
| --- | --- | --- |
| 2 | A04, A05, A10, A03 | Durable edits; conflict-safe sessions; correct associations; idempotent mutation outcomes. |
| 3 | A07, A09, A15, A17 | Truthful stream/storage/startup failures; bounded AI requests. |
| 4 | A11–A14, A16, A06 | Memory deletion reconciliation, recovery security, intended-app OAuth, working summaries. |
| 5 | A08, A18–A22 | Safe migration tooling, supported dependencies, meaningful enforced CI, verified deploys, tested documentation. |

A11 partly overlaps A01; deliver the privacy portion with the first batch and track any remaining synchronization work explicitly.

GitHub settings are a separate change set: protect main, require the actual CI status job, block force pushes/deletion, narrow bypass, and enable/review available security alerts. For a solo maintainer, do not impose an impossible second-person approval requirement. The audit has not verified account 2FA, private alerts, production secrets, or Render configuration.

## Evidence and reproduction

- [Full report](REPORT.md)
- [Recorded evidence](evidence.json)
- [Path/content inventory](inventory.json)
- [Read-only Node probes](verify-findings.mjs)
- [In-memory SQLite probes](verify-schema.py)

Observed before fixes: nine issue mechanisms reproduced; the live GitHub CI and CodeQL runs succeeded at the published snapshot. Deployment request steps were skipped. Main had no protection/rulesets. These observations are not a claim of overall security or production health.

# Batch 1 implementation — A01 and A02

Implemented locally after the audit, preserving the pre-existing UI/CI work. No commit, push, settings change, deployment, production cleanup, or production migration was performed.

## A01 — memory privacy

- Explicit global/session/quarantined visibility replaces the assumption that NULL session means public.
- Database triggers delete attached memories on chat/account/character deletion, including supported legacy schemas without parent cascades.
- Private writes require a live matching session. Conversation extraction without a session is skipped.
- SQL authorizes Python result IDs and supplies their content, preventing stale/deleted/foreign cached facts from returning through the app.
- An additive transactional migration preserves verified seed lore, classifies valid attached memories, and retains ambiguous legacy records under quarantine. Privacy migration failure rejects readiness.

**Rollout consideration:** uncertain old NULL-session memories, including custom lore, remain stored but hidden pending provenance review. No blanket data cleanup was run. See [the migration runbook](../../migrations/2026-10-27-memory-privacy.md).

## A02 — shared AI queue

- Both chat creation and chat requests validate provider type/value before accessing dependencies, returning 400 for malformed providers.
- The orchestrator also validates selection before enqueueing and snapshots it.
- Each worker item settles, unexpected errors reject the affected request, and processing state resets in finally.
- Fallback uses the registered provider and streaming without a native stream uses the same validated queue.

Existing canned fallback behavior is preserved. End-to-end timeouts/backlog bounds (A17) and broader streaming recovery (A07) remain later work.

## Validation

The new privacy and queue regressions were run against the original code and failed on the reported defects before implementation. Final results:

- **38/38 backend test files passed**, including the real HTTP/SQLite/SSE suite, on the final implementation. See [batch1-test-results.json](batch1-test-results.json).
- **21 new focused cases passed:** 8 privacy, 8 migration/recovery, and 5 queue/provider-validation cases.
- JavaScript syntax check: **131 files, zero failures**. The final changed migration/repository/test files were also syntax-checked after the last code change.
- Scoped diff whitespace checks passed.
- SHA-256 comparison confirmed all **18 pre-existing tracked edits** remained byte-for-byte unchanged.

The first restricted run blocked the HTTP suite's own localhost connection (EACCES). The HTTP suite then passed with local-server access enabled, and the final complete 38-file run passed in that environment. Tests used temporary databases and cleared cloud, email, and paid AI credentials. The three new suites use fresh fixtures; the existing HTTP suite's legacy bootstrap can copy the developer database into its temporary directory, but does not write the original database.

The original audit probes assert the presence of old defects and are retained unchanged. They are not the post-fix regression suite.

## Remaining scope

Audit A03–A22 remain open except for the privacy-related cache validation portion of A11 and privacy migration failure handling related to A09. Physical Python-store reconciliation, general migration readiness, deployment verification, GitHub protection, frontend integrity, and other audit batches are not claimed fixed here. A08's import/migration tooling also needs to carry the new visibility field when it is repaired; omitted visibility defaults to quarantine.

# Memory visibility rollout — batch 1

This code change implements audit A01. It has been tested with disposable local databases. It has not been applied to production during this task.

## Visibility rules

| Value | Meaning | Available to chat/public memory reads |
| --- | --- | --- |
| global | Intentionally public character lore, with no session | Yes |
| session | Private fact tied to an existing matching character/session | Only in the verified active session |
| quarantined | Legacy intent/ownership is uncertain | No |

A NULL session no longer means public. New memory objects without an explicit public decision default to quarantined. The authorized lore-creation service explicitly writes global; conversation extraction requires a session.

Deletion triggers remove attached memories before session deletion can null the foreign key. Additional user/character deletion triggers cover older schemas that lack the expected cascades. SQL also rejects new private memories unless the matching session, its owner, and its character still exist, including extraction that finishes after deletion.

Python is treated as a ranking cache. Every retrieved ID is checked against the current SQL scope after the Python request finishes; the application uses SQL content, not the cache's copy. Deleted, quarantined, wrong-character, and wrong-session records cannot re-enter an app reply through the cache. Physical cleanup/reconciliation of stale Python files remains separate A11 work; keep that service private.

## Automatic migration

`backend/db/migrations/20261027-memory-privacy.js` runs during database readiness, before seed insertion or normal queries. A transaction:

1. Adds the visibility column if missing, with quarantined as its default.
2. Classifies attached records as session only when the referenced character/session match.
3. Preserves the four original public seed facts only when ID, character ID, source, and content exactly match the reviewed seed tuples. An ID or source label by itself is insufficient.
4. Retains every other legacy NULL-session record as quarantined, including potentially intentional custom lore. It never deletes ambiguous records or guesses their original owner.
5. Records the migration version and installs the privacy triggers.

The operation is idempotent. Schema/backfill/trigger failure rolls back the transaction and rejects readiness. A repaired dependency can be retried by restarting the app. Existing unrelated migration handling is not comprehensively redesigned in this batch (A09 remains a later finding).

## Before a future production rollout

- Back up both SQL and the Python store and prove restoration on a disposable copy. Keep credentials and memory text out of public issue/CI logs.
- Run the migration on that copy, including representative legacy records. Measure lock duration against realistic data size; local fixtures do not establish production migration timing.
- Review intended custom global lore before release. Except for verified seeds, old NULL-session records will be hidden until their intent is established. Preserve uncertain records for investigation.
- Coordinate all application writers/readers. Do not run an older reader that still interprets every NULL session as public during a mixed-version rollout.
- After rollout, verify public reads, cross-user isolation, parent deletion, and the running revision. This task has not requested deployment.

## Reviewing quarantined legacy data

First inspect counts, without exposing memory content in shared logs:

```sql
SELECT visibility, COUNT(*) FROM character_memories GROUP BY visibility;
SELECT source, COUNT(*) FROM character_memories
WHERE visibility = 'quarantined' AND session_id IS NULL GROUP BY source;
```

A source label such as manual/wiki or a NULL session is not enough to prove publicity. Establish provenance from an approved content inventory or another trusted record. For a specifically reviewed record that is confirmed public, an authorized operator can use a parameterized conditional update inside a transaction:

```sql
UPDATE character_memories SET visibility = 'global'
WHERE id = ? AND visibility = 'quarantined' AND session_id IS NULL;
```

Verify exactly one affected row and its intended character. Do not publish all quarantined rows, and do not delete them merely to remove the warning. Reattaching private orphaned records requires independently established ownership/session provenance; it is a separate reviewed data repair.

## Recovery / rollback

- A failed migration leaves its changes uncommitted; correct the failure and retry on a restored fixture before restarting production.
- After a successful migration, prefer a forward repair retaining visibility and the privacy triggers. Do not drop them to restore an old reader.
- Rolling application code back to the vulnerable reader can expose previously orphaned facts. If rollback is unavoidable, block affected memory/chat routes and use a compatible patched reader or a reviewed backup-restore plan.
- Parent deletion intentionally deletes attached SQL memories after rollout. Restoring those requires a backup; migration rollback does not undo subsequent user deletions.

## Verification

The normal isolated runner discovers `tests/batch1-memory-privacy.test.mjs` and `tests/batch1-memory-migration.test.mjs`. These cover public/other-user reads, parent deletion, stale Python results, late extraction, seed preservation, legacy quarantine, missing cascades, idempotency, transaction rollback/retry, invalid scope writes, and startup failure.

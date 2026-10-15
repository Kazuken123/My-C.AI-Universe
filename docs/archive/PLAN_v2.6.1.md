# IMPLEMENTATION PLAN: Context-Aware Negation Guard, Bidirectional Inertia, Regenerate Idempotency & Schema Sync (v2.6.1)

## Technical Objectives
1. **Negation-Aware Signal Detection in `backend/services/relationship.service.js`**:
   - Filter out negated positive and negative words (e.g. "don't love", "not worthless", "không còn yêu", "đừng nghĩ mình vô dụng") via `#stripNegatedPhrases()`.
   - Distinguish cold rejection (`isColdRejection`) to damage attachment and increase strain, while reassurance (`isReassurance`) increases trust and softens strain.
2. **Bidirectional Inertia & AI Signal Reaction**:
   - Deep negative states (`affinity <= -40` or `trust <= -40`) resist flattery and apologies, keeping character mood at `'Suspicious / Guarded'`.
   - When user input is neutral or continuation, adapt the mood to AI reactions: `aiShowsFear` -> `'Afraid'`, `aiShowsSubmission` -> `'Submissive'`, `aiShowsHurtOrAnger` -> `'Guarded'` / `'Hurt'`, `aiShowsWarmth` -> `'Warm'`.
3. **Regenerate Idempotency & Manual Override Race Condition Guard**:
   - When generating alternative takes (`regenerate: true`), do not repeatedly compound user text strain/affinity. Only adapt immediate mood to the newly chosen take.
   - When updating relationship via Director Popover (`PUT /api/chats/:sessionId/relationship`), auto-resolve `relationshipStage` if not explicitly passed.
   - In `frontend/js/chat.js`, guard against in-flight responses clobbering recent manual Director overrides via `lastDirectorOverrideTime`.
4. **Schema Synchronization & Version Alignment**:
   - Synchronize `cols` in `scripts/migrate-to-turso.js`.
   - Update `backend/db/create_database.sql` with full relational schema.
   - Align system ping route in `backend/routes/index.js` and `tests/api.test.js` to version `2.6.1`.

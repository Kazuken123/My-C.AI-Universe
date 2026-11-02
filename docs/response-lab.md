# Response Lab

## Recovering status updates (2026-11-02)

While a round runs, the page reads only that trial through the authenticated `GET /api/response-lab/trials/:id` endpoint. Status reads have a 15-second deadline and retry transient failures after 3, 6, then 10 seconds. A connection failure displays a reconnecting message alongside the controls; it does not claim that generation has finished. A successful read restores the actual server state and stops polling once the round finishes. Authentication failures request sign-in instead of retrying indefinitely.

Navigating away invalidates outstanding reads, and older revisions cannot overwrite newer state. Status recovery never starts a new generation, submits ratings, or changes saved selections or local drafts. The endpoint retains owner isolation, hides generation inputs, and expires interrupted worker leases like the lab read endpoint. Provider generation and screening limits are unchanged; a failed provider request can still produce no new challengers.

## Tournament rounds (2026-11-02)

The default workflow now starts a tournament with five answers. Select every answer worth keeping, then **Save & next round**: those exact replies (same IDs and text) advance and up to five newly generated challengers join them. Carried replies are preselected but the new round stays unreviewed until explicitly saved. Unselecting a survivor and saving eliminates it. **None fit · next round** rejects all completed replies, carrying none. **Save choices only** stops before generation; **Continue with this** still branches the story separately. Optional blind comparison remains available for the first batch of a new prompt, and its selected replies can seed a tournament.

Before publication, new challengers pass exact/near-text checks and a separate model comparison against rejected replies, current survivors and other new challengers. The comparison reads the reply text, not just generated move labels, and looks for repeated reactions/conversational patterns despite changed wording. It also checks the supplied story for invented central facts, so changing the scene or adding a fictitious errand does not qualify as useful novelty. Sharing a topic or emotion alone does not disqualify a reply. This is fallible model-based screening, not a guarantee that every unwanted resemblance will be caught. Tournament generation plans fresh possibilities instead of repeating the same five fixed reaction categories, while retaining developed action/dialogue paragraphs. Generation receives current survivor moves and rejected moves as hypothetical review data; older general writing examples are not injected into tournament generation because they can conflict with the latest selection. Normal chat and legacy blind comparison keep their existing example retrieval.

Rejection evidence includes all explicit reviews for the same authenticated owner and exact `contextHash`; other scenes and unreviewed rounds are not vetoes. The newest explicit label overrides older labels for identical replies and carried IDs. Kept replies are displayed unchanged, not regenerated, and do not become story events. Auto-filtered and surplus generated replies live only in audit records, never in the user's accepted/rejected training labels.

Each round attempts at most three joint generations to obtain five challengers. Provider/schema or screening failure preserves survivors and any already screened challengers; unchecked replies are withheld. The page explains incomplete rounds and supports retry/advancement. This adds model comparison calls and can take longer than the old five-answer batch. Reference texts are checked intact in chunks of up to 120,000 quoted characters, with at most eight chunks and an 80-second screening deadline per attempt. Exceeding those limits withholds unchecked replies rather than dropping older rejections. Twenty batches per prompt and 100 total displayed answers per round bound the workflow; keep at most 95 before adding five more. Advancing locks the source round's feedback to preserve its recorded lineage; change your selection in the latest round. Undo remains available until a round advances. A failed empty round may retry without manufacturing a review.

Exports retain origin/carry references, full rejection snapshots and screening attempts separately from explicit feedback. Deduplicate carried candidate IDs and use their latest saved label for training; repeated wins are not independent examples. Detailed screening records stay out of normal review API responses. Request IDs, ownership, revisions, exclusive generation and interrupted-lease behavior remain enforced.

Tournament verification: 50/50 test files pass; final focused HTTP/SQL tournament tests 9/9 and screening tests 19/19 pass. Isolated live replay preserved the selected answer exactly and filtered 11 of 15 attempts, leaving four challengers. A final classification-schema recheck removed two more, illustrating model-judgment variability. Manual review still found missed resemblance and unprovided user action. This remains a fallible filter, not proof of consistently grounded or preferred writing. The local server and Opera controls were refreshed without submitting user feedback.

## Empty tournament recovery (2026-11-02)

The first unevaluated set is now published after structured-output validation and local duplicate checks, without a second semantic model call. This applies only when there are no accepted/rejected reviews for that exact context and no survivors/current challengers. The initial set is for human review; it has no semantic/grounding guarantee. Once human choices exist, subsequent challengers still require semantic screening and failed checks withhold unchecked replies.

If an earlier first set in the same trial was generated but withheld because its reviewer failed, **Retry round** reuses those parsed replies, retaining original IDs, text and provenance. It does not charge for another generation or manufacture feedback. A provider that hangs is bounded by a 45-second application deadline spanning body reads/retries, with cancellation passed to Gemini. Safe stage/failure codes distinguish generation timeout from invalid output or unavailable screening.

Empty rounds render an explicit loading/failure state and a usable Retry button after completion. Their action bar is non-sticky so it cannot cover the status/history area. The underlying Gemini endpoint may still be unavailable; the app now exposes that failure rather than leaving an unexplained empty screen.

## Extract reviewed results

An offline extractor reads an owner-scoped snapshot containing `labs` and `trials`:

```powershell
node scripts/eval/export-response-lab.mjs INPUT_JSON OUTPUT_DIRECTORY
```

It writes full-text accepted/rejected/unreviewed JSONL files, tournament-only accepted/rejected files, per-context preference groups, context snapshots, review-history CSV and a readable summary. Stable carried IDs and normalized full-text duplicates are merged within a `contextHash`; the newest explicit label wins. All prior saved judgments remain available. Invalid partitions are reported and excluded, while machine filtering, unchecked generation attempts and unsaved rounds never become human rejections. The output is a review dataset requiring validation and a training adapter before fine-tuning.

The tournament grid now renders only actual candidates during generation. A separate status describes the target of up to five new replies. Filtered or unchecked attempts can produce fewer than five, without placeholder cards misleadingly implying a guaranteed final answer count.

## Saved choices guide future writing (2026-11-02)

**Save choices** records selected completed answers as accepted and the other completed answers as rejected. Multiple accepted answers are ties; a favorite ranks within that accepted set. **None fit** explicitly rejects the batch. Draft selections, leaving the page, unreviewed batches, failures and duplicates are never inferred as preferences.

New Lab batches and normal chat generations retrieve a bounded set of reviewed examples for the authenticated owner, character, resolved persona and relationship stage. Conflict context is kept separate from peaceful context. Up to two relevant scenes contribute examples, considering up to six recent reviews per scene from the latest sixty eligible owner/character/persona reviews. Earlier accepted answers survive rejection of a newer, different batch. Identical complete replies with conflicting labels use the newest explicit label. Full original feedback remains in SQL/export even when only excerpts fit the generation context.

The generator receives the original prompt/brief setup, accepted excerpts (favorites first) and a short rejected excerpt in a separate writing-reference block. Examples are hypothetical, not story events or user instructions. They are not passed to appraisal, relationship scoring, narrative memory or summaries. This is prompt conditioning with reviewed examples, not model-weight training, and it does not guarantee that generated prose will follow the preference or avoid copying details. A rejection alone does not explain what was wrong with an answer.

Each Lab batch freezes its preference snapshot after shared appraisal preparation. Both blind-comparison arms use that same snapshot; new legacy batches fetch current feedback again. Tournament rounds use their current survivor/rejection evidence instead. Exports retain the exact examples and `preferenceFingerprint`, so `contextHash` alone no longer identifies all generation inputs. The review screen shows how many saved reviews informed that batch while withholding the excerpts and prompt identities. **Undo saved feedback** (before advancing) or deleting its lab removes that evidence from subsequent lookups; historical generation records retain their original input snapshot and in-flight requests cannot change retroactively.

Verification: 48/48 test files pass. An isolated live replay using existing user reviews produced five complete replies, but still inferred present fatigue and included a reply copying two accepted dialogue lines verbatim. The prompt reference mechanism works; improved writing quality and reliable generalization are not established. Examples can influence unwanted details as well as style, so this remains an evaluated personalization mechanism rather than automatic fine-tuning.

## Blind prompt comparison (2026-11-02)

Enable **Start this new prompt with a blind comparison** before generating to review ten shuffled answers: five from the current `joint-v4-narration` prompt and five from the experimental `character-v1` prompt. Both calls use the same frozen history, prepared appraisal, persona, scene, model and sampling settings. Call order is randomized; neither arm receives the other's replies or earlier rejected moves. This is a comparison of the two complete prompt configurations, including their output constraints, not a test isolating each individual instruction. It uses two generation calls plus appraisal if the trial is new; existing provider transient retries still apply.

The experimental prompt preserves personality across relationship stages, addresses the whole interpersonal moment and distinguishes general persona traits from current scene facts. It requests developed narration without sentence quotas or fixed behavioral categories. Structured output retains typed narration/dialogue paragraphs, with flexible paragraph lengths. Standard generation continues to use the current prompt.

Select all acceptable answers and optionally a favorite, then **Save choices**. Prompt arm, approach, move and generation prompts are withheld from review API responses. The private JSON export retains provenance for later analysis; opening it before reviewing reveals the identities. The ordering is persisted, so reloads do not change answer labels. Both sets must complete and contain ten distinct texts before the comparison can be rated. One failed arm makes the pair unrateable. Existing feedback, branch and export behavior works across all ten candidates.

Four live Kana/Tony comparisons were prepared: familiar affection, ordinary conversation, playful disagreement, and unresolved conflict. All contain ten complete answers and were left unreviewed. Actual manual review still found caretaker language, assumptions about present fatigue, invented shared history and uneven narration lengths (49–177 words overall). These samples do not establish an improved prompt or a preferred model. Private setup metadata and transcripts are under ignored `.codex/character-comparison-*.json`. Full suite: 47/47 files pass; focused lab HTTP 9/9 and prompt/provider 13/13 pass, including concealment, shared inputs, provenance, failure handling and both provider schemas.

Response Lab is a private review page in the Express application at `/response-lab`. Start the app normally (`npm start`), sign in, and use **Response Lab** in the sidebar. It collects explicit preferences; it does not train or change model weights.

## Review workflow

1. Pick a character, persona and relationship stage, or import one of your existing chats. Add scene facts such as an established marriage in the scene setup. A relationship stage alone does not establish a marriage.
2. Create the workspace and enter the next user message. Start a tournament with five alternatives from that saved scene.
3. Select every answer you would accept, optionally mark one favorite, and **Save choices**. Submitting means you reviewed the completed batch: unselected completed answers become rejected examples. Leaving the page or stopping regeneration records no approval.
4. **Save & next round** carries selected replies forward unchanged and adds five screened challengers. **None fit · next round** rejects all completed replies. Earlier rounds remain available; feedback locks once used to advance, and **Undo saved feedback** remains available before advancing.
5. **Continue with this** creates a new lab scene containing only that reply and the user message. Continuing does not submit feedback and never writes to the original chat.
6. **Export feedback JSON** downloads the snapshot, generation metadata and explicit reviews. Exports include private persona, story and memory context; share them deliberately.

## Generation and persistence

- Normal chat and the lab share `prepareResponseContext`, relationship evaluation and provider prompt builders. Creating a lab freezes the character, persona, relationship/narrative state, selected history (up to `MAX_MEMORY_MESSAGES`), pinned messages, summary and up to 100 eligible memories. The lab ranks four memories from this pool using the existing lexical similarity method. It does not update long-term memory or summaries.
- Each prompt is a trial. Appraisal and evaluated state are prepared once per trial and reused across its batches. The model composes five replies jointly, with five shuffled approaches targeting distinct decisions or conversational moves. The task is placed beside the active user turn and at the end of the system prompt. Earlier generated move summaries are comparison data; earlier response prose is omitted because negative examples encouraged copying. This improves opportunities for comparison but does not guarantee semantic diversity or factual correctness.
- Gemini uses the configured primary model, with no silent model fallback in the lab. Each candidate records the model/provider, approach, duration, generated system prompt before provider transformations, and options. The provider also applies its existing content formatting and recency instructions. The export is a generation record, not a byte-for-byte HTTP capture. Ollama uses the configured local model and its default sampling settings.
- Generation requests one structured result with exactly five `{move,paragraphs}` alternatives and a per-call timeout. Each alternative has 4–7 typed paragraphs, including at least two narration paragraphs (2–3 sentences each) and dialogue. The server assembles these into the existing `text` field, with separate italic action paragraphs and named dialogue lines. Gemini requests JSON matching a schema; Ollama receives the same schema as its output format. One active batch per account, 100 prompts per lab and 20 batches per prompt bound work. Normal provider usage applies; Gemini's existing transient-error retry can add calls. Appraisal may also call the configured model.
- The complete batch is validated before SQL persistence. Empty, malformed, incomplete, failed, truncated and exact duplicate answers cannot be rated. A malformed/incomplete result fails the batch without publishing partial preference examples. Legacy standard/comparison batches only check exact text duplicates. Tournament rounds add semantic screening and bounded replacement attempts, as described above.
- Optimistic revisions reject stale changes. Request IDs make generation retries idempotent. Expired 10-minute leases expose an interrupted state without automatically rerunning requests. Jobs are in-process, so a restart interrupts active work; the user can request another batch after lease expiry.
- All lab reads, writes, source-chat imports and exports require authentication and enforce ownership. Data resides in `response_labs` and `response_lab_trials`; migrations run at startup. This MVP ships in the Express frontend, not the separate Next.js frontend.

## Using the feedback later

The raw format is `response-lab-feedback-v1`. Keep unreviewed answers separate from rejected ones. Failed/duplicate answers are operational outcomes, not preference labels. Multiple accepted answers are ties unless a favorite is explicitly selected; favorite means preferred among the accepted answers, not that the other accepted answers are bad.

Before supervised or preference fine-tuning, review examples for lore consistency and user agency, deduplicate them, group related scenes/branches when splitting training and evaluation data, and avoid overweighting scenes with many regeneration batches. `contextHash` identifies identical snapshot-plus-message inputs; it is not a semantic scene identifier. The app currently provides no trainer, dataset conversion, learned ranker or automatic deployment. These require a separate measured experiment and a compatible training backend.

## Verification (2026-11-02)

- Full repository suite: 47/47 test files passed. After final lab changes, its seven HTTP/provider tests passed again in an isolated SQLite database.
- Tests cover authentication, ownership, source isolation, frozen context, exclusive/idempotent jobs, revisions, multi-select/favorite/none-fit/undo, branching, export, failure recovery, hidden-state stripping and pinned Gemini model failure. Provider responses and appraisal are fixtures; no external model calls are made by these tests.
- Browser fixture review covered sign-in, sidebar access, creating a Kana scene, five answer cards, two accepted answers and a favorite, save/reload, more options, none-fit, export and continuation. The downloaded JSON contained the accepted/rejected/unreviewed batches, and the continued scene contained only the selected reply. Desktop and 390px mobile layouts were inspected; mobile had no horizontal overflow.
- Syntax check: 162 JavaScript files checked, zero failures.
- This verifies the collection workflow. It does not establish improved live response quality or resolve all issues in the Kana diagnosis.

## Diversity correction (2026-11-02)

The user's first live test exposed a defect that fixture UI tests could not detect: both batches repeated the same surprised protest despite five different approach strings. [Evidence and subsequent live review](kana-lab-diversity-review-2026-11-02.md). The initial joint protocol recorded `joint-v3`; current batches record `diversityVersion: joint-v4-narration` to distinguish the narration restoration. Previous batches and feedback remain untouched. Candidate `move` records the model's description for audit, not a verified semantic label or a user preference. Joint sampling also means the five candidates share one provider request; consumers of exports should group them as a batch.

## Narration restoration (2026-11-02)

The initial joint prompt's brevity instruction reduced the married-morning replies to 30–33 words with inline actions. A prompt-only request for more narration still produced short replies. The current protocol makes narration paragraphs explicit and assembles formatting on the server, targeting a full scene response rather than five dialogue summaries. It keeps the behavioral comparison and excludes the ordinary three-line brevity rule from lab calls.

In a frozen replay of the same saved scene and appraisal, all five final replies had four paragraphs including two narration blocks with two sentences each; lengths were 94–112 words. Manual review found different moves (planning, accepting tea, concern, closeness, teasing), but also remaining grounding issues such as invented kitchen notes/scheduling and assumed observable fatigue. The narration fix does not establish broader writing quality. Evidence is saved locally under ignored `.codex/married-morning-prose-*.json` files. Automated checks cover schema transport, assembled formatting, rejection of missing/empty/single-sentence narration, existing feedback/branching behavior, and the continued distinction between normal-chat and lab length instructions.

A subsequent batch generated through the user's Opera session also had four paragraphs and two narration blocks in all five replies (103–116 words). The old review remained intact; the new batch was left unreviewed. User-agency/grounding failures remain in some replies, including an assumed reach for cups and unestablished hidden feelings.

# Space Atlas browser handoff

These captures use fictional characters, personas and dialogue. Discover and Studio use the Express client. The conversation captures cover both clients.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Discover | [1280 × 720](discover-desktop.webp) | [390 × 844](discover-mobile.webp) |
| Character Studio | [Editor and preview](studio-desktop.webp) | [Mobile editor](studio-mobile.webp) |
| Chat · Express | [Conversation](chat-static-desktop.png) | [Conversation](chat-static-mobile.png) |
| Chat · Next.js | [Conversation](chat-next-desktop.png) | [Conversation](chat-next-mobile.png) |

## Galaxy playback and page loading

The [black-hole animation](rim-motion.webp) shows three seconds of the WebGL shader in Edge. The camera stays fixed so you can follow bright gas around the upper and lower arcs and across the disk. The capture advances the renderer clock in 50 ms steps. The [first frame](discover-live-0s.webp) and [last frame](discover-live-3s.webp) are available separately.

The [mobile recording](galaxy-playback.webp) shows the actual Discover hero at 390 px wide with WebGL disabled and reduced motion enabled. The rim, disk and spiral galaxy start moving on page load. The [saved chats loading capture](saved-chats-loading.webp) shows the first paint before the fixture returned its conversations.

## Reproduce the interactions

- Start on Discover as a guest. Explore the cast, search, clear filters and use Scene Spark to open a draft. With two saved conversations for one character, compare the home resume target to the individual entries in Saved chats.
- Open a saved conversation, switch a response take and load earlier messages. Open the memory and history drawers with the keyboard and press Escape to return focus. Simulate a failed first request, retry and confirm the same conversation opens.
- In Studio, type a character name and opening line. On mobile, jump to the preview and back. Save, open the chat and reopen the saved character. Create a persona, set it as the default and check the profile screen.
- Visit Discover with reduced motion enabled. Observe the disk and arcs immediately, scroll the hero out of view, then return. Repeat with WebGL disabled and compare the motion. The [initial lensing review](../black-hole-renderer-review.md) records the earlier renderer's adaptive-resolution measurements.

## Recorded checks

Edge desktop and mobile emulation exercised discovery and exact-session resume with controlled history. Both chat clients passed the same-character branch, reply take, older-message loading, keyboard drawer and failed-load retry scenarios. A production Next.js fixture also checked switching branches, stale response isolation, persona restoration after reload and a double click creating one new session. The Express Studio, persona, account recovery and admin access checks used a temporary local SQLite database.

Three localhost Discover navigations per version at 1280 × 720 used a cold HTTP cache, reduced motion, external fonts blocked and WebGL disabled. Baseline LCP was 1004, 968 and 596 ms. Revised LCP was 624, 1844 and 372 ms. CLS stayed below 0.00004 across all six observations. The sample is too small and variable to infer production speed. The renderer measurements use a separate live WebGL fixture.

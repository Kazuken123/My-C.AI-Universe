---
name: My C.AI Universe - Orbit Studio
description: A quiet cinematic character studio with midnight navy, starlight white, nebula violet and an animated three-dimensional universe.
colors:
  canvas: "#090b18"
  surface: "#121427"
  elevated: "#1c1d36"
  text: "#f4f2ff"
  secondary: "#b7b6ce"
  muted: "#9695b3"
  accent: "#c4b5fd"
  accent-hover: "#ddd4ff"
  starlight-blue: "#79c9ef"
typography:
  display: "Manrope"
  editorial: "Newsreader"
  body: "Manrope"
  mono: "JetBrains Mono"
---

# Orbit Studio

The default theme retains the persisted key `higgsfield` for compatibility, with a new Orbit Studio visual system. Other saved themes remain available.

## Visual direction

Use a midnight navy canvas, starlight white typography and nebula violet actions. Cool blue is a small decorative accent. Prefer restrained borders and tonal surfaces over nested containers. Discovery uses compact horizontal character shelves; conversations remain a focused reading workspace.

Manrope handles controls, names and prose. Newsreader italic gives the main discovery heading a literary voice. JetBrains Mono is reserved for small numeric metadata. Text on the violet primary action uses dark purple ink.

## Layout

- Desktop navigation: 256px sidebar, collapsing to a 72px icon rail. Mobile drawers restore full labels regardless of the saved desktop preference.
- Discover only: a fixed 202px Dynamic Island capsule expands to 440px (bounded by the viewport), with Scene Spark mood choices, editable roleplay openers and a character selector. Search remains in the page. The full-width hero places its text over a deep space panorama with many distant galaxies, curved cosmic filaments, nebular rivers, a ringed world, a shaded planet and an artistic black hole.
- Characters: compact 330px horizontal cards with scroll snapping. Previous/next arrows appear on hover or focus, remain visible on touch screens, and disappear at boundaries. Touch swiping and Arrow/Home/End keys also browse the row.
- Mobile: existing off-canvas menu and bottom navigation, stacked hero, horizontally scrollable genres.
- Chat, character studio, threads, personas and account pages share the new tokens, typography and interaction treatment.
- Existing API routes, authentication, sorting, likes, character editing and chat entry remain connected.

## Motion

Motion stays on. There are no pause controls, and old saved pause preferences are cleared. Rendering can suspend in hidden tabs or offscreen.

- A slowly drifting 3D camera, multiple rotating galaxies, a cosmic web of clusters, nebular rivers and foreground celestial bodies. Pointer movement changes perspective across the whole hero. A layered CSS space scene remains visible when WebGL is unavailable.
- Floating annotations, paused when the artwork leaves the viewport.
- Scroll entrance reveals with a small stagger, plus gentle hero parallax.
- The floating capsule gains a brighter violet rim after 24px of scrolling. Its width and height animate while retaining rounded corners; tap pins it open and Escape or an outside click dismisses it.
- Gentle lift and portrait scaling on compact cards; rotating violet and blue starfield accents.
- Short press feedback, visible keyboard focus, form and message entrance transitions.
- Passive scroll/pointer listeners, requestAnimationFrame batching and one shared observer; no additional animation dependency.
- The universe renders at up to 30fps with a backing canvas capped near 1.6 million pixels and fewer particles on compact layouts. It suspends offscreen or in a hidden tab and releases GPU resources when its route unmounts.

## Usability

Search has an accessible name and a slash-key shortcut. Genre filters expose their pressed state. Character cards support keyboard entry and retain separate chat/edit/like actions. Async searches ignore stale responses. The roster distinguishes loading, empty results and request failure, with clear-filter and retry actions.

## Implementation

The island and carousel use the shared motion script, with listener and observer cleanup on Next route changes. Scene Spark reads characters from the rendered catalogue, with no extra API requests and no sidebar mirroring. Hidden menu content is inert and removed from keyboard navigation.

`frontend/css/orbit.css` and `frontend/js/orbit-motion.js` are mirrored into `nextjs-frontend/app/orbit.css` and `nextjs-frontend/public/js/orbit-motion.js`. The WebGL renderer frontend/js/universe-scene.js is mirrored into nextjs-frontend/public/js/universe-scene.js. Keep each pair byte-identical. The Express hero lives in `frontend/index.html`; React uses `components/characters/orbit-hero.tsx`.

## Design research and reference

- [Stitch project](https://stitch.withgoogle.com/projects/3986601467563097206) — design exploration, with prototype-only content.
- [Stitch preview](docs/design/orbit-stitch-preview.jpg) - reference prototype screenshot, not a capture of the implemented app.
- [GetLayers library](https://www.getlayers.ai/) and [Orb](https://www.getlayers.ai/layer/orb) — cinematic composition and orbital inspiration. The universe uses original procedural WebGL geometry with a CSS fallback; no paid asset was imported.
- [Radix palette composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) — neutral and accent pairing research.
- [Manrope](https://fonts.google.com/specimen/Manrope) and [Newsreader](https://fonts.google.com/specimen/Newsreader) — typography research.

## Dashboard navigation behavior

The Dynamic Island is rendered only on the dashboard. Hover opens Scene Spark; tap pins it open. Escape, tapping the trigger again, or clicking outside dismisses it. Keyboard focus can open it and enter its controls.

The character shelf supports swipe, previous/next, Arrow Left/Right and Home/End. Arrows disappear at the beginning/end and while results load. Search/category/sort changes reset the shelf to its first card. Screen readers receive the visible character range. Existing like, edit and chat actions retain their accessible names.

Validation: run `node --test tests/ui-navigation.test.js` for island interaction and carousel boundary regressions, alongside the Next.js TypeScript/lint/unit checks.


## Scene Spark island

The 202px capsule expands to 440px with one continuous width and height morph. The inner panel lays out at its final width throughout the transition, avoiding text reflow and height jumps.

Its purpose is writing a roleplay opener: choose Cozy, Mystery, Adventure or Tension, reroll a curated prompt, edit or copy it, select a character from the loaded catalogue, and open the chat with the text in the composer. The user reviews and sends the draft. The island has no navigation, recent-chat list, account settings or animation controls.

Old pause preferences are discarded. Ambient effects and the island animation remain enabled. Rendering still suspends when invisible to avoid unnecessary GPU work.


## Vast Discover panorama

Discover uses an edge-to-edge 3D scene across the workspace, with a desktop hero between 650px and 920px tall and a taller mobile composition. The left side carries readable copy over a directional dark veil; the right and lower scene remain open. A continuous deep-field background extends beneath character shelves and remains visible when search hides the hero.

The procedural renderer combines a distant galaxy field, three particle galaxies, curved filaments and clusters, textured nebular rivers, a shaded planet, a ringed world and an artistic black hole. Camera drift and pointer parallax reveal their different depths. This deliberately mixes astronomical scales for atmosphere; it is not a map or a simulation of the observable universe.

Light-emitting particles render additively. Foreground bodies use normal alpha blending so their dark sides occlude distant stars. The scene draws at up to 30fps, caps its backing canvas near 1.6 million pixels, reduces geometry on mobile, suspends when invisible and releases resources on route removal. No new dependency, external texture download or animation toggle is introduced.

Inspiration: [Webb's First Deep Field](https://science.nasa.gov/asset/webb/webbs-first-deep-field-nircam-image/) for depth and varied galaxy silhouettes; [NASA large-scale structures](https://science.nasa.gov/universe/galaxies/large-scale-structures/) for clusters, filaments and dark voids. The artwork is original procedural geometry and shaders.

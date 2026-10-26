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
- Discover only: a fixed 202px Dynamic Island capsule expands to 440px (bounded by the viewport), with navigation, storylines, account, persona, settings, theme and motion controls. Search remains in the page. The asymmetric hero contains a perspective WebGL universe with a spiral galaxy, two distant galaxies, nebulae and stars.
- Characters: compact 330px horizontal cards with scroll snapping. Previous/next arrows appear on hover or focus, remain visible on touch screens, and disappear at boundaries. Touch swiping and Arrow/Home/End keys also browse the row.
- Mobile: existing off-canvas menu and bottom navigation, stacked hero, horizontally scrollable genres.
- Chat, character studio, threads, personas and account pages share the new tokens, typography and interaction treatment.
- Existing API routes, authentication, sorting, likes, character editing and chat entry remain connected.

## Motion

Motion is on by default. The visible pause control persists the existing `ambient_motion_disabled` preference.

- A slowly rotating spiral galaxy, distant galaxies, layered stars and nebula dust. Pointer movement gently changes camera perspective. A static CSS galaxy remains visible when WebGL is unavailable.
- Floating annotations, paused when the artwork leaves the viewport.
- Scroll entrance reveals with a small stagger, plus gentle hero parallax.
- The floating capsule gains a brighter violet rim after 24px of scrolling. Its width and height animate while retaining rounded corners; tap pins it open and Escape or an outside click dismisses it.
- Gentle lift and portrait scaling on compact cards; rotating violet and blue starfield accents.
- Short press feedback, visible keyboard focus, form and message entrance transitions.
- Passive scroll/pointer listeners, requestAnimationFrame batching and one shared observer; no additional animation dependency.
- The universe renders at up to 30fps with capped pixel density and fewer particles on compact layouts. It pauses offscreen, in a hidden tab, or through the motion toggle, and releases GPU resources when its route unmounts.

## Usability

Search has an accessible name and a slash-key shortcut. Genre filters expose their pressed state. Character cards support keyboard entry and retain separate chat/edit/like actions. Async searches ignore stale responses. The roster distinguishes loading, empty results and request failure, with clear-filter and retry actions.

## Implementation

The island and carousel use the shared motion script, with listener and observer cleanup on Next route changes. The React island shares sidebar session/persona state; Express mirrors existing sidebar controls without another API fetch. Hidden menu content is inert and removed from keyboard navigation.

`frontend/css/orbit.css` and `frontend/js/orbit-motion.js` are mirrored into `nextjs-frontend/app/orbit.css` and `nextjs-frontend/public/js/orbit-motion.js`. The WebGL renderer `frontend/js/universe-scene.js` is mirrored into `nextjs-frontend/public/js/universe-scene.js`. Keep each pair byte-identical. The Express hero lives in `frontend/index.html`; React uses `components/characters/orbit-hero.tsx`.

## Design research and reference

- [Stitch project](https://stitch.withgoogle.com/projects/3986601467563097206) — design exploration, with prototype-only content.
- [Stitch preview](docs/design/orbit-stitch-preview.jpg) - reference prototype screenshot, not a capture of the implemented app.
- [GetLayers library](https://www.getlayers.ai/) and [Orb](https://www.getlayers.ai/layer/orb) — cinematic composition and orbital inspiration. The universe uses original procedural WebGL geometry with a CSS fallback; no paid asset was imported.
- [Radix palette composition](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) — neutral and accent pairing research.
- [Manrope](https://fonts.google.com/specimen/Manrope) and [Newsreader](https://fonts.google.com/specimen/Newsreader) — typography research.

## Dashboard navigation behavior

The Dynamic Island is rendered only on the dashboard. It exposes navigation, active threads, account, persona, theme, motion and sidebar controls using the existing data and handlers. A tap pins it open; Escape, tapping the trigger again, or clicking outside dismisses it. Keyboard focus can open it and enter its controls.

The character shelf supports swipe, previous/next, Arrow Left/Right and Home/End. Arrows disappear at the beginning/end and while results load. Search/category/sort changes reset the shelf to its first card. Screen readers receive the visible character range. Existing like, edit and chat actions retain their accessible names.

Validation: run `node --test tests/ui-navigation.test.js tests/universe-scene.test.js` for island interaction and carousel boundary regressions, alongside the Next.js TypeScript/lint/unit checks.

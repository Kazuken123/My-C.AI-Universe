# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Creative writers, interactive fiction enthusiasts, anime/game canon fans, and roleplayers who want persistent, psychologically grounded multi-turn scenes with characters that remember past interactions, adapt their emotional stance over time, and recognize the user's active persona identity.

## Product Purpose

My C.AI Universe is a full-stack relational Character.AI studio and narrative roleplay workspace. It enables users to discover canonical or original characters, synthesize rich character profiles from Fandom/Wikipedia wikis or AI prompts, configure multiple user personas, and engage in branching dialogue scenes with long-term semantic memory and a dual-timescale psychological relationship engine.

## Positioning

Unlike stateless chat wrappers that suffer from amnesia or abrupt personality resets, My C.AI Universe combines relational SQL persistence (Turso Cloud LibSQL), hybrid semantic vector memory recall, optimistic O(1) multi-take response swiping, and a 4-variable psychological relationship engine (`affinity`, `trust`, `strain`, `relationshipMood`) that models emotional inertia and breaking points across long storylines.

## Operating Context

Used in desktop and mobile web browsers across two primary modes:
- **Discovery & Character Architecture (`/` and `/create.html`)**: Browsing the character roster, inspecting featured canon dossiers, and authoring or importing character definitions with starting relationship dynamics.
- **Narrative Operation (`/chat.html`, `/chats.html`, `/personas.html`)**: High-focus, long-session roleplay chatrooms with keyboard-driven take swiping (`<-` / `->`), inline turn editing, message rewinding, context pinning, live relationship telemetry, and slide-over history/memory drawers.

## Capabilities and Constraints

- Dual-frontend parity: Express static HTML/CSS/JS (`frontend/`) and Next.js 14 App Router (`nextjs-frontend/`) sharing unified CSS design tokens and layout architecture.
- Multi-theme architecture led by **Orbit Studio** (persisted key: `higgsfield`), with midnight green, ivory and sage. Other workspace themes remain selectable.
- 60fps HTML5 Canvas ambient motion backdrop (`AmbientMotionCanvas`) with user-toggleable motion control.
- Real-time voice synthesis (Web Speech API TTS) and Fandom/Wikipedia canon ingestion.

## Brand Commitments

- **Brand Name**: My C.AI Universe (Orbit Studio)
- **Brand Mark**: `/favicon.svg`
- **Visual Direction**: Cinematic editorial discovery, portrait cards, a CSS 3D orbital sculpture and quiet green reading surfaces. See DESIGN.md for the current tokens and motion system.
- **Typography**: Manrope for UI and prose, Newsreader for editorial headings, JetBrains Mono for numeric metadata.

## Evidence on Hand

- Canonical character database hosted on Turso Cloud (`backend/db/schema.sql`, `backend/db/seed.js`) featuring Kana Arima and seeded canon profiles.
- Automated verification suite (`npm test`) covering 34 unit, E2E integration, SQL security, and psychological relationship engine tests.

## Product Principles

1. **Narrative Immersion First**: Chrome recedes during active roleplay; typography, line measure (65ch), and contrast prioritize effortless long-form reading.
2. **Instant Tactile Receipt**: Every take swipe, like toggle, and drawer toggle responds immediately in the DOM with physical compression (`scale(0.97)`) and zero layout shift.
3. **Psychological Permanence**: Relationship state, pinned memories, and thread branches are always transparent, inspectable, and controllable by the user.
4. **Cinematic Craft Without AI Slop**: Reject generic violet neon glows and flat templates in favor of machined double-bezel surfaces, specular top rims, and calibrated atmospheric lighting.

## Accessibility & Inclusion

- Default Orbit Studio text and action color pairs are checked against the WCAG AA 4.5:1 target. Visible focus, keyboard actions and an animation pause control are provided.
- Minimum 11px (`0.72rem` at `16px` root) functional UI typography floor across all badges, keycaps, and metadata labels.
- Full keyboard navigation (`/` to search, `1–4` workspace shortcuts, `[` sidebar collapse, `<-`/`->` take swiping, visible `:focus-visible` rings, and skip-to-workspace link).

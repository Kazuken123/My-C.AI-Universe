---
name: My C.AI Universe — GetLayers Cinema Design System
description: High-craft dark obsidian, platinum chrome, warm peach, and periwinkle design system inspired by GetLayers.ai with Double-Bezel machined containers and tactile micro-interactions.
colors:
  canvas-bg: "#060606"
  surface-1: "#0d0d0d"
  surface-2: "#141414"
  surface-elevated: "#18181c"
  text-primary: "#f5f5f5"
  text-secondary: "#a8a8b0"
  text-muted: "#8e8e98"
  accent-primary: "#ffa582"
  accent-peach: "#ffbea2"
  accent-chrome: "#e8eaef"
  accent-silver: "#bcc0ca"
  accent-periwinkle: "#a2b7f5"
  accent-cream: "#feeae1"
  border-soft: "rgba(255, 255, 255, 0.08)"
  border-subtle: "rgba(255, 255, 255, 0.14)"
  border-strong: "rgba(255, 255, 255, 0.22)"
  status-success: "#86e3b5"
  status-warning: "#f4c983"
  status-danger: "#ff7676"
typography:
  display:
    fontFamily: "General Sans, Cabinet Grotesk, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "General Sans, Cabinet Grotesk, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Onest, Satoshi, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "normal"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.78rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  serif:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.01em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  shell: "22px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "36px"
components:
  button-primary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "6px 8px 6px 20px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.text-primary}"
  card-shell:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.shell}"
    padding: "6px"
---

## Overview

**My C.AI Universe** uses the **GetLayers Cinema** design language (`data-theme="higgsfield"` default): an obsidian-first workspace (`#060606` canvas, `#0d0d0d` primary surface, `#141414` elevated surface) illuminated by brushed platinum chrome (`#e8eaef`, `#bcc0ca`), warm peach/terracotta (`#ffa582`, `#ffbea2`), and atmospheric periwinkle (`#a2b7f5`). Rather than relying on saturated AI purple/violet neon glows, depth is achieved through specular top rims (`inset 0 1px 0 rgba(255, 255, 255, 0.09)`), subtle warm/cool aurora surface washes (`--tw-aurora`), and nested Double-Bezel containers.

## Colors

- **Substrates**:
  - `--bg-canvas`: `#060606` (Deep Obsidian)
  - `--bg-core` / `--surface-1`: `#0d0d0d` (Primary Card & Panel Surface)
  - `--bg-core-elevated` / `--surface-2`: `#141414` (Elevated Control & Hover Surface)
  - `--bg-rail`: `rgba(11, 11, 11, 0.9)` (Sidebar & Header Stage)
- **Typography Ink**:
  - `--text-primary`: `#f5f5f5` (Crisp Alabaster, 18.2:1 contrast on `#0d0d0d`)
  - `--text-secondary`: `#a8a8b0` (Muted Silver, 8.1:1 contrast on `#0d0d0d`)
  - `--text-muted`: `#8e8e98` (Accessible Slate, 5.8:1 contrast on `#0d0d0d` — used for all secondary metadata and form placeholders)
- **Accents & Specular Highlights**:
  - `--accent`: `#ffa582` (GetLayers Warm Peach)
  - `--accent-hover`: `#ffbea2` (Luminous Peach)
  - `--accent-chrome`: `#e8eaef` (Platinum Chrome)
  - `--accent-silver`: `#bcc0ca` (Brushed Silver)
  - `--accent-periwinkle`: `#a2b7f5` (Periwinkle Refraction)
  - `--accent-gradient-premium`: `linear-gradient(90deg, #bcc0ca -1.05%, #feeae1 41.74%, #c0cef2 102.46%)`
  - `--text-on-accent`: `#0d0d0d` (Obsidian ink on warm peach or platinum chrome surfaces, >9.8:1 contrast)

## Typography

- **Root Scale**: `16px` (`1rem = 16px`), with a strict `11.5px` (`0.72rem`) floor on all functional labels, badges, keycaps, and timecodes.
- **Display & Section Headings**: `General Sans` and `Cabinet Grotesk` (`font-weight: 500–700`, `letter-spacing: -0.025em` to `-0.035em`, `line-height: 1.12`, `text-wrap: balance`).
- **Body & Roleplay Dialogue**: `Onest` and `Satoshi` (`1rem`, `line-height: 1.7` for narrative prose, constrained to `65ch` measure in chat streams).
- **Telemetry & Keycaps**: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for counters, relationship scores, and keyboard shortcuts.

## Layout

- **App Shell**: Fixed `268px` left studio rail (`.sidebar`) paired with a fluid main workspace (`.main-workspace`, constrained to `max-width: 1380px` in directory/studio views and `780px` in active dialogue streams).
- **Asymmetric Bento Roster**: 12-column CSS Grid (`.bento-grid`) dynamically assigning `.bento-wide` (`col-span-8`), `.bento-half` (`col-span-6`), and `.bento-cell` (`col-span-4`) based on item count so no row ever leaves an empty trailing cell.
- **Responsive Collapse**: Below `1024px`, multi-column grids collapse gracefully; below `768px`, the sidebar becomes a slide-over drawer (`transform: translateX(-100%)`) with a fixed mobile top bar.

## Elevation & Depth

- **Single Elevation Authority**: Outer shells (`.double-bezel-shell`) declare a `1px solid rgba(255, 255, 255, 0.08)` border with compact tonal elevation (`0 10px 14px -8px rgba(0, 0, 0, 0.7)`). Inner cores (`.double-bezel-core`) omit outer borders (`border: 0`) and instead use GetLayers' top specular rim (`box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.09)`) over an aurora surface wash (`var(--tw-sheen), var(--tw-aurora), var(--bg-core)`).
- **No Chromatic Outer Glows**: Colored zero-offset `box-shadow` halos on dark backgrounds are banned. Illumination happens *inside* interactive controls via inset warm/cool refraction (`inset 0 -16px 28px -16px rgba(255, 165, 130, 0.35), inset 18px 0 32px -20px rgba(162, 183, 245, 0.28)`).

## Shapes

- **Concentric Double-Bezel Radii**:
  - Outer Shell (`--radius-shell`): `22px` (with `6px` padding inset)
  - Inner Core (`--radius-core`): `16px` (`22px - 6px = 16px`)
  - Controls & Inputs (`--radius-md` / `--radius-sm`): `12px` / `8px`
  - Interactive Pills (`--radius-pill`): `9999px`

## Components

- **GetLayers Specular Island Button (`.btn-island`)**: Full-pill button featuring a dark translucent glass body, warm peach + cool periwinkle inset refraction, a diagonal specular rim, and a brushed platinum circular trailing icon (`.btn-island-icon`, `background: linear-gradient(180deg, #fff 0%, #e6e7ee 55%, #c9ccd6 100%)`, `color: #0d0d0d`). Hover brightens the surface and glides the icon `+3px` horizontally; `:active` compresses to `scale(0.97)`.
- **Character Spotlight & Bento Cards**: Double-bezel containers with cursor-tracked radial border illumination (`--mouse-x`, `--mouse-y`), crisp square/squircle avatars, tabular interaction counters, and optimistic heart toggles.
- **Relationship Director Bar & Popover**: Live psychological telemetry pill in the chat header showing stage, bond score, emotional weather badge, and GPU-accelerated `scaleX` progress bar.

## Do's and Don'ts

- **Do** use GetLayers' warm peach (`#ffa582`), platinum chrome (`#e8eaef`), and periwinkle (`#a2b7f5`) tokens with `#0d0d0d` dark ink on filled accents.
- **Do** animate exclusively with `transform` and `opacity` using exponential ease-out (`cubic-bezier(0.22, 1, 0.36, 1)`).
- **Don't** use generic AI purple/indigo (`#8b5cf6`, `#6366f1`) or colored outer `box-shadow` glows.
- **Don't** place tracked uppercase kickers directly above `<h1>`/`<h2>` headings or set any functional UI text below `11px` (`0.72rem`).
- **Don't** use `border-left` stripes thicker than `1px` or infinite pulsing/bouncing decorative animations.

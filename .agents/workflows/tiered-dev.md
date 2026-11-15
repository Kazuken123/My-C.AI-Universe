---
name: tiered-dev
description: Run a quota-efficient multi-agent feature or refactor workflow using tiered models, AI Studio MCP offload, and deterministic repo hooks
---

# Workflow: Tiered Multi-Agent Development

1. **Clarify & Spec (Coordinator — Argon / Hydrogen)**:
   - Ask clarifying questions for ambiguous seams (`grill-me`), align terminology (`GLOSSARY.md`), and define disjoint file ownership per worker.
2. **Reconnaissance & Diff Triage (Flash / AI Studio MCP)**:
   - Delegate broad file discovery to `research` subagents (`Model: "flash"`) or `ai-studio-offload` (`ai_studio_analyze_files`).
3. **Implementation (TDD + Disjoint Workers)**:
   - Write failing tests first (`tdd`).
   - For 1–2 files, edit directly. For 3+ independent files/modules, spawn `swarm` authors (`workspace: "share"`, `model: "gemini-4-hydrogen-low"` for routine edits or session model for complex logic).
4. **Independent Verification (Flash Verifier + Deterministic Harness)**:
   - Assign a fresh `flash` verifier (`workspace: "inherit"`) to review the diff and run `npm test` + `nextjs-frontend` checks (`npm run typecheck`, `npm run lint`, `npm test`).
   - Let `.agents/hooks.json` deterministically enforce syntax checks and secret/scratch commit hygiene.
5. **Repo Finalization Checklist**:
   - Update `PROGRESS.md`.
   - Run `graphify update .`.
   - Run `npm run audit:pack`.
   - Run `npm test` after final edits, then commit and push `origin main`.

---
name: swarm-audit
description: Run a quota-efficient multi-agent security audit combining Cloudflare's security-audit skill, docs/audit-history.md, and AI Studio MCP offload
---

# Workflow: Quota-Efficient Security Audit

1. **Read prior evidence first (mandatory)**:
   - Read `docs/audit-history.md` and `.agents/rules/evidence_based_audit.md`.
   - Do not re-report items in `Resolved Findings Registry` or `Dismissed Hypotheses & Intentional Architectural Invariants` without new reproducible regression proof.
2. **Load skills**:
   - Load `security-audit` (`~/.gemini/config/skills/security-audit/SKILL.md`) and `tiered-swarm`.
   - Default to **Guidance mode** for focused reviews; use **Full audit mode** only when explicitly requested, writing artifacts outside the repo under `~/security-audit-skill/<repo-name>/run-<N>`.
3. **Tiered execution to save Argon/Hydrogen quota**:
   - Use `ai-studio-offload` (`ai_studio_analyze_files`, `ai_studio_review_diff`) for initial surface mapping and large-file scanning.
   - Use `invoke_subagent` (`TypeName: "research"`, `Model: "flash"`) or `swarm` workers on `gemini-3.8-flash-medium` (`workspace: "inherit"`) for independent hunting and adversarial verification.
   - Keep the main Argon/Hydrogen coordinator strictly on synthesis, verification gating, and final sign-off.
4. **Windows validator note**:
   - `validate-coverage-ledger.cjs` and `validate-findings.cjs` require POSIX `O_NOFOLLOW`/`O_NONBLOCK` when invoked via CLI file reads and will reject file opens on Windows. On Windows, validate generated JSON objects by importing their exported validation functions in Node or running the CLI inside WSL/Linux.
5. **Update ledger**:
   - Record the inspected commit SHA, executed checks, and confirmed findings (or `0 confirmed findings`) in `docs/audit-history.md`.

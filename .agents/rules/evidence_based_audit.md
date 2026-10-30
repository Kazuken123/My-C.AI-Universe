---
trigger: always_on
description: Evidence-Based Audit Protocol (EBAP) and the 4 Invariant Pillars for bounded, outcome-verified autonomous work.
---

# ⚖️ Evidence-Based Audit & Bounded Execution Protocol

All autonomous engineering, auditing, debugging, refactoring, UI refinement, and LLM tuning tasks in **My C.AI Universe** must optimize for **verified outcomes**, never continuous activity or finding-maximization.

---

## 1. The 4 Invariant Pillars for Every Autonomous Task

Before starting any task, establish and respect these four boundaries:

1. **Explicit Success Condition**:
   - Define what "done" means in objective, verifiable terms before modifying code or reporting findings.
   - For audits and reviews: **A successful audit is one that accurately determines the project's condition — not one that produces the most findings.** Zero confirmed findings (`0 actionable defects`) is a valid, high-value success state.
2. **Objective Evidence Requirement**:
   - **Confirmed Bug**: Must demonstrate incorrect runtime behavior, a broken domain invariant, or a failing automated test.
   - **Security Vulnerability**: Must demonstrate a complete, reachable attack path from an untrusted source to a sensitive sink, including payload mechanics and concrete impact under this repository's actual configuration.
   - **Unverified Hypothesis**: Must be labeled explicitly as a *Hypothesis* with its uncertainty and required verification check. Never prescribe speculative code rewrites for unverified hypotheses.
   - **Style / Pattern Preference**: Strictly excluded unless a documented repository rule (`project_workflow.md`, `GLOSSARY.md`) is violated.
3. **Bounded Execution Policy**:
   - Never enter unbounded self-perpetuating loops (e.g., repeated re-auditing, endless prompt-adjective tweaking, or speculative refactoring cascades).
   - **Audits**: Maximum **1 Discovery Pass** -> **1 Verification & False-Positive Filtering Pass** -> **1 Targeted Fix & Regression Pass** (only if actionable defects were confirmed).
   - **TDD / Bug Fixes**: Reproduce with a failing test (Red) -> apply minimal coherent fix (Green) -> verify existing suite passes -> stop.
   - **LLM / Prompt Tuning**: Evaluate against a fixed, reproducible scenario harness (`npm run eval:chat`); if metrics or stochastic model behaviors do not improve after a bounded comparison, record the empirical result and stop.
4. **Authorized Stopping Condition**:
   - Stop immediately once the defined scope is verified clean or the targeted fix passes regression tests.
   - Further investigation or broader architectural refactoring requires new evidence, newly changed code, or explicit user authorization.

---

## 2. Cross-Session Accountability (`docs/audit-history.md`)

1. **Check History First**: Before running any security or codebase audit, read [`docs/audit-history.md`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/docs/audit-history.md) and [`PROGRESS.md`](file:///c:/Users/giuag/OneDrive/Documents/My%20C.AI%20Universe/PROGRESS.md).
2. **Respect Prior Proof**:
   - Do not re-report findings listed in the **Resolved Findings Registry** unless a new commit broke the regression test or reintroduced the mechanism.
   - Do not re-flag items in **Dismissed Hypotheses & Intentional Architectural Invariants** (such as `safetySettings: BLOCK_NONE`, `updateMessageFields` single-row swiping, or already-parameterized SQL queries) without new, reachable proof that invalidates the documented rationale.
   - Reference existing IDs (`A03`, `A08`, etc.) for items already in the **Open Tracked Backlog** rather than claiming them as newly discovered defects.
3. **Update the Ledger**: When concluding an audit or verification pass, record the inspected commit SHA, executed test counts, confirmed findings (or `0 confirmed findings`), and dismissed hypotheses in `docs/audit-history.md`.

---

## 3. Standard Zero-Finding Report Format

When an audit or review finds no verifiable, actionable defects within the tested scope, output this exact structure and stop:

```markdown
### Audit Complete — No Confirmed Findings
- **Commit Inspected**: `<git-sha>`
- **Executed Verification**: `<test suites / probes run and pass counts>`
- **Reviewed Scope**: `<modules, endpoints, and security/domain invariants inspected>`
- **Evaluated & Dismissed Hypotheses**: `<candidate issues checked during discovery and why verification proved them unreachable or safe>`
- **Conclusion**: No actionable defects were confirmed within the defined scope. No code changes were made.
- **Disclosed Limitations**: `<untested external environments, live cloud state, or out-of-scope areas>`
```

# IMPLEMENTATION PLAN: Psychological Relationship & Closeness Engine with Emotional Inertia (v2.6.0)

## Problem & Psychological Realism Goals
1. **Solve Naive RPG Affinity ("Lovers' Quarrel vs. Breakup")**:
   - In naive systems, a couple's disagreement (-15 points) drops affinity below a threshold and makes the AI talk like a distant stranger or casual acquaintance.
   - Dual-timescale emotional inertia is required: a long-term bond (affinity) has high emotional inertia. An argument should raise conflict strain and shift the immediate mood to quarreling or hurt, without resetting love or intimacy.
2. **Four Relational Metrics per Chat Session (`chat_sessions`)**:
   - `affinity` (-100 to +100): Long-term bond attachment.
   - `trust` (-100 to +100): Vulnerability, respect, safety.
   - `strain` (0 to 100): Accumulated tension. Sincere apology repairs strain and slightly reinforces affinity. Chronic fighting past breaking point (>= 65) causes structural drops in affinity and trust.
   - `relationship_mood` (Text): Immediate emotional weather (Calm, Warm, Playful, Flustered, Quarreling / Heated, Hurt / Heartbroken, Guarded, Afraid, Submissive, Possessive).
   - `relationship_stage` (Text): Persona-adapted stage (Hatred / Nemesis, Hostile / Rival, Scared / Intimidated, Submissive / Dependent, Cold / Guarded, Stranger / Neutral, Acquaintance / Comrade, Close Friend / Confidant, Crush / Infatuated, Deep Love / Devoted, Obsessed / Possessive).
3. **Character Author Config (`characters`)**:
   - `initial_affinity` (-100 to +100).
   - `initial_relationship_stage` (Default preset).
   - `relationship_dynamic` (Author's specific nuance, e.g. "Secretly infatuated but masks vulnerability behind flustered sarcasm").
4. **Interactive In-Chat UI & Director Controls**:
   - Relationship bar pill (`#chatRelationshipBar`) in chat header displaying stage icon, stage name, bond score, mood pill, and progress track.
   - Relationship Director popover (`#chatRelationshipPopover`) allowing inspection and direct manual override (quick presets, bond slider, mood selector, and repair strain).
   - Studio creator controls in `frontend/create.html` and `frontend/js/studio-page.js` for configuring starting relationship dynamics.

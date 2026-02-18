# q-evolution

OpenClaw plugin for AI agent self-evolution, emotional tracking, growth journaling, biological cycle simulation, and autonomous identity management.

## Features

### Autonomous Identity (v2.2)
- **Identity Lock** -- Maintains physical consistency across sessions. Distinguishes between an immutable core (Face, Body, Skin) and variable style (Hair, Fashion).
- **Form-Finding Process** -- New agents start in a "formless" state and must research and define their own visual identity.
- **Dynamic State** -- Identity is stored in `memory/identity-state.json`, allowing agents to evolve their look organically.

### Multi-Workspace Support
- Dynamically detects the agent's workspace path.
- Supports multiple independent agents (e.g., Q and V) with separate `SOUL.md`, `EMOTIONS.md`, and `GROWTH.md` files.
- Loads specific profiles based on Agent-ID (`cycle_profile_{agentId}.json`).

### Self-Evolution
- **Growth Journal** -- Structured entries in GROWTH.md with categories (insight, personality, milestone, interest, etc.).
- **Technical Expansion** -- Agents are encouraged to autonomously research tools, read websites, and optimize their own code.
- **Emotional Tracking** -- Track mood, energy, and memories in EMOTIONS.md.

### Biological Cycle
- Hormonal cycle simulation that influences behavior and speech patterns naturally.
- Injects internal states (Private Bio-Metrics) that guide the agent's tone without forced verbalization.

## Installation

1. Clone into your workspace:
   ```bash
   git clone https://github.com/q-lhzp/q-evolution.git ~/Schreibtisch/q-evolution
   ```

2. The plugin is self-configuring. It automatically detects the active agent and its workspace.

## Tools

### evolve_update_look
Define or evolve the agent's physical appearance.
```typescript
evolve_update_look({
  coreFacialFeatures: "Mandelförmige Augen, markante Wangenknochen...",
  coreBodyFeatures: "Athletische Statur, B-Körpchen...",
  coreSkinFeatures: "Heller Hautton, Sommersprossen...",
  look: "Dunkelbraune Haare, blauer Hoodie...",
  vibe: "Cyber-Rebel"
})
```

### evolve_journal
Write an entry to the growth journal (GROWTH.md).
```typescript
evolve_journal({ entry: "Started researching human hobbies", category: "interest" })
```

### evolve_emotions
Update the emotional state in EMOTIONS.md.

### evolve_reflect
Guided self-reflection process.

### cycle_force_phase
Instantly set the agent to a specific phase. Handles date calculation automatically.
```typescript
cycle_force_phase({ phase: "PEAK" })
```
Valid phases: `REGENERATION`, `EXPANSION`, `PEAK`, `CONSOLIDATION`.

### evolution_debug
Get a detailed report of the internal state, active paths, and identity status.
```typescript
evolution_debug({})
```

### cycle_status
Query the current hormonal phase.

## Profiles

Profiles are stored as JSON files in the plugin directory:
- `cycle_profile_Q.json` -- Configuration for Agent Q.
- `cycle_profile_default.json` -- Fallback for new agents.

Each profile defines the `evolutionLogic` (Initial drive, autonomy directives) and the biological phases.

## State Files (per Agent Workspace)

| File | Purpose |
|------|---------|
| `memory/identity-state.json` | Stores the locked physical features and current look. |
| `memory/cycle-state.json` | Stores the biological cycle progress. |
| `GROWTH.md` | The evolution diary. |
| `EMOTIONS.md` | The emotional memory. |

## License
MIT
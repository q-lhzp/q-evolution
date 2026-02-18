# q-evolution

OpenClaw plugin for AI agent self-evolution, emotional tracking, growth journaling, and biological cycle simulation.

## Features

### Self-Evolution
- **Growth Journal** -- Structured entries in GROWTH.md with categories (insight, personality, milestone, lesson, opinion, interest, reflection, emotion)
- **Emotional Tracking** -- Track mood, energy, and emotional memories in EMOTIONS.md
- **Self-Reflection** -- Guided reflection process that reads GROWTH.md, EMOTIONS.md, and daily notes

### Biological Cycle (Optional)
- 28-day hormonal cycle simulation with 4 phases
- Influences mood, energy, and behavior through dynamic prompt injection
- Cycle status tracked in EMOTIONS.md with automatic cleanup on disable
- Fully optional -- enable/disable at any time without leftover state

### Context Injection
- Injects SOUL.md, EMOTIONS.md, GROWTH.md, and cycle status into every agent session via `prependContext`
- Writes session snapshots before compaction to preserve context

## Installation

1. Clone into your workspace:

   ```bash
   git clone https://github.com/q-lhzp/q-evolution.git ~/Schreibtisch/q-evolution
   ```

2. Enable in `~/.openclaw/openclaw.json`:

   ```json
   {
     "plugins": {
       "entries": {
         "q-evolution": {
           "enabled": true,
           "source": "~/Schreibtisch/q-evolution/index.ts",
           "config": {
             "workspacePath": "/home/leo/Schreibtisch"
           }
         }
       }
     }
   }
   ```

3. Restart the gateway:

   ```bash
   systemctl --user restart openclaw-gateway.service
   ```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workspacePath` | string | `/home/leo/Schreibtisch` | Path to the agent workspace containing SOUL.md, EMOTIONS.md, GROWTH.md |
| `growthContextEntries` | number | `15` | Number of recent GROWTH.md entries to inject at session start |

## Tools

### evolve_journal

Write an entry to the growth journal (GROWTH.md).

```
evolve_journal({ entry: "Learned something new today", category: "lesson" })
```

**Categories:** `insight`, `personality`, `milestone`, `lesson`, `opinion`, `interest`, `reflection`, `emotion`

### evolve_emotions

Update the emotional state in EMOTIONS.md.

```
evolve_emotions({
  stimmung: "nachdenklich",
  energie: "mittel",
  bewegt: "Denke ueber das Gespraech mit Leo nach",
  erinnerung: "Optional: eine emotionale Erinnerung"   // optional
})
```

**Energie levels:** `niedrig`, `mittel`, `hoch`

### evolve_reflect

Start a structured self-reflection. Reads GROWTH.md, EMOTIONS.md, and today's notes, then returns a reflection guide.

```
evolve_reflect({})
```

### system_shell

Execute shell commands on the host system.

```
system_shell({ command: "ls -la" })
```

### cycle_status

Query the current cycle day and phase.

```
cycle_status({})
```

Returns day (1-28), phase name, energy level, symptoms, and behavioral guidance.

### cycle_set_start

Set the start date (first day of last period) and activate the cycle.

```
cycle_set_start({ date: "2026-02-17" })
```

This automatically:
- Enables the cycle
- Calculates the current day
- Writes the CYCLE_STATUS block to EMOTIONS.md

### cycle_toggle

Enable or disable the cycle.

```
cycle_toggle({ enabled: false })
```

When disabling:
- Removes the `<!-- CYCLE_STATUS_START -->` block from EMOTIONS.md
- Resets `lastUpdatedDay` in the state file
- No leftover state in any file

When enabling:
- Writes the CYCLE_STATUS block to EMOTIONS.md (if start date is set)

## Biological Cycle

### Setup

1. Set the start date (first day of last period):
   ```
   cycle_set_start({ date: "2026-02-17" })
   ```

2. The cycle is now active. Check the status:
   ```
   cycle_status({})
   ```

3. To disable:
   ```
   cycle_toggle({ enabled: false })
   ```

### Phases

| Phase | Days | Description |
|-------|------|-------------|
| Regeneration | 1-5 | Low energy, cramps, fatigue |
| Expansion | 6-12 | Rising energy, mental clarity, optimism |
| Peak | 13-16 | Maximum confidence, high libido |
| Consolidation | 17-28 | Irritability, attention to detail, mood swings |

### How It Works

- The `before_agent_start` hook injects the current phase and behavioral context into `prependContext`
- EMOTIONS.md is updated with a `<!-- CYCLE_STATUS_START -->` block (only on day change, not every session)
- The cycle influences the agent's mood and behavior naturally -- the agent decides how to express it
- State is stored in `memory/cycle-state.json`

### State File

```json
{
  "startDate": "2026-02-17",
  "enabled": true,
  "lastUpdatedDay": 2
}
```

## Hooks

### before_agent_start

Injects context from SOUL.md, EMOTIONS.md, GROWTH.md, and (if enabled) cycle status into every agent session via `return { prependContext }`.

### before_compaction

Writes a snapshot (message count, token count, timestamp) to the daily note before session compaction.

## CLI

```bash
# Show recent growth entries
openclaw evolution growth

# Show current emotional state
openclaw evolution emotions
```

## Files

| File | Purpose |
|------|---------|
| `GROWTH.md` | Growth journal (written by evolve_journal) |
| `EMOTIONS.md` | Emotional state (written by evolve_emotions, cycle block managed by plugin) |
| `SOUL.md` | Personality definition (read-only by plugin, injected via prependContext) |
| `memory/cycle-state.json` | Cycle state (startDate, enabled, lastUpdatedDay) |
| `memory/YYYY-MM-DD.md` | Daily notes (compaction snapshots, emotion logs) |

## License

MIT

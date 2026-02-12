# q-evolution

OpenClaw plugin for AI agent self-evolution, personality development, and growth journaling.

## Features

- **Compaction Guard**: Writes snapshots to daily notes before session compaction
- **Growth Context Injection**: Injects recent GROWTH.md entries into every session
- **evolve_journal Tool**: Structured growth journal entries with categories
- **evolve_reflect Tool**: Guided self-reflection process

## Installation

1. Clone into your OpenClaw extensions directory:

   ```bash
   cd ~/.openclaw/extensions
   git clone https://github.com/q-lhzp/q-evolution.git
   ```

2. Install dependencies:

   ```bash
   cd q-evolution && npm install
   ```

3. Enable in `~/.openclaw/openclaw.json`:

   ```json
   {
     "plugins": {
       "entries": {
         "q-evolution": {
           "enabled": true,
           "config": {
             "workspacePath": "/home/leo/Schreibtisch"
           }
         }
       }
     }
   }
   ```

4. Restart the gateway:

   ```bash
   systemctl --user restart openclaw-gateway.service
   ```

## Configuration

- `workspacePath` (string, default `/home/leo/Schreibtisch`)
- `growthContextEntries` (number, default `15`)

## License

MIT

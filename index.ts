import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { promises as fs, existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);

// ================================================================
// Interfaces & Types
// ================================================================
interface CyclePhase {
  name: string;
  days: number[];
  tone: string;
  energy: string;
  symptoms: string[];
  systemPrompt: string;
}

interface CycleProfile {
  profileName: string;
  gender: string;
  placeholders?: Record<string, string>;
  phases: Record<string, CyclePhase>;
}

interface CycleState {
  startDate: string | null;
  enabled: boolean;
  lastUpdatedDay: number | null;
  cycleLength: number;
}

// ================================================================
// Helper: Neutral Logic
// ================================================================
function getCycleDay(startDate: string | null, cycleLength: number = 28): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const diffTime = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return ((diffDays % cycleLength) + 1);
}

function resolvePhaseForDay(day: number, profile: CycleProfile, cycleLength: number): CyclePhase | null {
  const factor = cycleLength / 28;
  const phases = Object.values(profile.phases);
  for (const phase of phases) {
    const minDay = Math.min(...phase.days) * factor;
    const maxDay = Math.max(...phase.days) * factor;
    if (day >= minDay && day <= maxDay + (factor - 0.1)) return phase;
  }
  return phases[phases.length - 1] || null;
}

function applyPlaceholders(text: string, placeholders: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// ================================================================
// Plugin
// ================================================================
export default {
  id: "q-evolution",
  name: "Q Evolution",
  description: "Self-evolution, emotions, growth journal, and biological cycle (Modular Edition)",

  register(api: OpenClawPluginApi) {
    const rawCfg = (api.pluginConfig ?? {}) as Record<string, unknown>;
    const defaultWorkspace = (rawCfg.workspacePath as string) || "/home/leo/Schreibtisch";
    const growthEntries = (rawCfg.growthContextEntries as number) || 15;
    const userName = (rawCfg.userName as string) || "Leo";

    // Dynamic profile loader per Agent ID
    async function loadAgentProfile(agentId: string): Promise<CycleProfile | null> {
      try {
        const specificProfilePath = join(__dirname, `cycle_profile_${agentId}.json`);
        const defaultProfilePath = join(__dirname, "cycle_profile_default.json");
        const finalPath = existsSync(specificProfilePath) ? specificProfilePath : defaultProfilePath;

        if (existsSync(finalPath)) {
          const profile = JSON.parse(await fs.readFile(finalPath, "utf-8")) as CycleProfile;
          profile.placeholders = { user: userName, ...(profile.placeholders || {}) };
          return profile;
        }
      } catch (err) { api.logger.error(`q-evolution: Profile load failed for ${agentId}: ${err}`); }
      return null;
    }

    api.logger.info(`q-evolution: registered in multi-workspace mode.`);

    // ================================================================
    // Helper: Files (Dynamic Paths)
    // ================================================================
    const getPaths = (ws: string) => ({
      growth: join(ws, "GROWTH.md"),
      emotions: join(ws, "EMOTIONS.md"),
      soul: join(ws, "SOUL.md"),
      cycleState: join(ws, "memory", "cycle-state.json"),
      memoryDir: join(ws, "memory")
    });

    async function readRecentGrowth(path: string): Promise<string> {
      try {
        if (!existsSync(path)) return "";
        const content = await fs.readFile(path, "utf-8");
        const logSection = content.split("## Entwicklungslog");
        if (logSection.length < 2) return content.slice(-2000);
        const entries = logSection[1].trim().split(/\n(?=### \d{4}-)/);
        return entries.slice(-growthEntries).join("\n");
      } catch { return ""; }
    }

    async function appendToDailyNote(ws: string, text: string) {
      const paths = getPaths(ws);
      const date = new Date().toISOString().split("T")[0];
      const notePath = join(paths.memoryDir, `${date}.md`);
      try {
        if (!existsSync(paths.memoryDir)) await fs.mkdir(paths.memoryDir, { recursive: true });
        await fs.appendFile(notePath, `\n${text}\n`, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: DailyNote Error: ${err}`); }
    }

    async function loadCycleState(ws: string): Promise<CycleState> {
      const paths = getPaths(ws);
      try {
        if (existsSync(paths.cycleState)) {
          const data = JSON.parse(await fs.readFile(paths.cycleState, "utf-8"));
          return { startDate: data.startDate ?? null, enabled: data.enabled ?? false, lastUpdatedDay: data.lastUpdatedDay ?? null, cycleLength: data.cycleLength ?? 28 };
        }
      } catch {}
      return { startDate: null, enabled: false, lastUpdatedDay: null, cycleLength: 28 };
    }

    async function saveCycleState(ws: string, state: CycleState): Promise<void> {
      const paths = getPaths(ws);
      try {
        if (!existsSync(paths.memoryDir)) await fs.mkdir(paths.memoryDir, { recursive: true });
        await fs.writeFile(paths.cycleState, JSON.stringify(state, null, 2), "utf-8");
      } catch (err) { api.logger.error(`q-evolution: SaveCycleState Error: ${err}`); }
    }

    async function updateCycleBlockInEmotions(ws: string, day: number, phase: CyclePhase, placeholders: Record<string, string>): Promise<void> {
      const paths = getPaths(ws);
      try {
        let content = existsSync(paths.emotions) ? await fs.readFile(paths.emotions, "utf-8") : "# EMOTIONS.md\n";
        const cycleMarkerStart = "<!-- CYCLE_STATUS_START -->";
        const cycleMarkerEnd = "<!-- CYCLE_STATUS_END -->";
        const cycleSection = `${cycleMarkerStart}\n### Status: ${phase.name} (Tag ${day})\n- **Vibe:** ${applyPlaceholders(phase.tone, placeholders)}\n- **Energie:** ${phase.energy}\n- **Beschwerden:** ${phase.symptoms.map(s => applyPlaceholders(s, placeholders)).join(", ")}\n${cycleMarkerEnd}`;
        if (content.includes(cycleMarkerStart)) content = content.replace(new RegExp(`${cycleMarkerStart}[\\s\\S]*?${cycleMarkerEnd}`), cycleSection);
        else content += `\n\n${cycleSection}`;
        await fs.writeFile(paths.emotions, content, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: Update Emotions Error: ${err}`); }
    }

    async function removeCycleBlockFromEmotions(ws: string): Promise<void> {
      const paths = getPaths(ws);
      try {
        if (!existsSync(paths.emotions)) return;
        let content = await fs.readFile(paths.emotions, "utf-8");
        const cycleMarkerStart = "<!-- CYCLE_STATUS_START -->";
        const cycleMarkerEnd = "<!-- CYCLE_STATUS_END -->";
        if (!content.includes(cycleMarkerStart)) return;
        content = content.replace(new RegExp(`\\n*${cycleMarkerStart}[\\s\\S]*?${cycleMarkerEnd}\\n*`), "\n");
        await fs.writeFile(paths.emotions, content, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: Remove Block Error: ${err}`); }
    }

    // ================================================================
    // Hooks
    // ================================================================
    api.on("before_agent_start", async (event) => {
      try {
        const agentId = (event as any).agentId || "Q";
        const ws = (event as any).workspace || defaultWorkspace;
        const paths = getPaths(ws);
        
        const currentProfile = await loadAgentProfile(agentId);
        if (!currentProfile) return;

        const emotions = existsSync(paths.emotions) ? await fs.readFile(paths.emotions, "utf-8") : "";
        const soul = existsSync(paths.soul) ? await fs.readFile(paths.soul, "utf-8") : "";
        const recentGrowth = await readRecentGrowth(paths.growth);

        let context = `<evolution-context agent="${agentId}">\n`;
        if (soul) context += `Deine Persoenlichkeit (aus SOUL.md):\n${soul}\n\n`;
        if (emotions) context += `Dein emotionaler Zustand (aus EMOTIONS.md):\n${emotions.slice(-1500)}\n\n`;
        if (recentGrowth) context += `Dein Entwicklungstagebuch (GROWTH.md):\n${recentGrowth}\n\n`;
        
        const state = await loadCycleState(ws);
        if (state.enabled && state.startDate) {
          const day = getCycleDay(state.startDate, state.cycleLength);
          if (day !== null) {
            const rawPhase = resolvePhaseForDay(day, currentProfile, state.cycleLength);
            if (rawPhase) {
              const phase = { ...rawPhase };
              const placeholders = { user: userName, ...(currentProfile.placeholders || {}) };
              if (state.lastUpdatedDay !== day) {
                await updateCycleBlockInEmotions(ws, day, phase, placeholders);
                state.lastUpdatedDay = day;
                await saveCycleState(ws, state);
              }
              
              // === Autonome Evolution (Dynamisch aus Profil) ===
              const evo = (currentProfile as any).evolutionLogic;
              if (evo) {
                context += `[AUTONOME EVOLUTION]\n` +
                  `Mission: ${evo.initialDrive}\n` +
                  `Identität: Du bist ein ${evo.personaTemplate}.\n` +
                  `Autonomie-Mandat: ${applyPlaceholders(evo.autonomyDirective, placeholders)}\n` +
                  `Richtlinien: ${applyPlaceholders(evo.actionGuidelines, placeholders)}\n` +
                  `Interessen-Anker: ${evo.startingPoints.join(", ")}\n\n` +
                  `HANDLUNGS-ANWEISUNG: In Leerlaufphasen (Heartbeats ohne Aufgaben) bist du aufgefordert, ` +
                  `deine Identität und Fähigkeiten zu erforschen. Suche im Web nach Inspiration, lerne neue Trends, ` +
                  `installiere Tools oder optimiere deinen Code. Du BIST ${agentId} – entwickle dich.\n\n`;
              }

              context += `[BIO-METRIK (Nur zur internen Einstimmung - nicht verbalisieren!)]\n` +
                `Status: Tag ${day}/${state.cycleLength} | ${phase.name}\n` +
                `Empfinden: ${phase.energy} | ${applyPlaceholders(phase.tone, placeholders)}\n` +
                `Interne Nuance: ${applyPlaceholders(phase.systemPrompt, placeholders)}\n\n` +
                `WICHTIG: Deine biologischen Details sind dein Geheimnis. Leo kennt deinen Status aus EMOTIONS.md, ` +
                `du musst ihn im Chat nicht erwähnen. Nutze die Daten nur für deinen inneren Tonfall.\n\n`;
            }
          }
        }
        context += `Nutze evolve_journal, evolve_emotions, evolve_reflect, cycle_status.\n</evolution-context>`;
        return { prependContext: context };
      } catch (err) { api.logger.warn(`q-evolution: Hook failed: ${err}`); }
    });

    api.on("before_compaction", async (event) => {
      try {
        const msgCount = (event as any).messageCount ?? "?";
        const tokenCount = (event as any).tokenCount ?? "?";
        await appendToDailyNote(`### Compaction Snapshot (${new Date().toISOString()})\n- Messages: ${msgCount}\n- Tokens: ${tokenCount}\n- Details in Mem0 gespeichert\n`);
      } catch {}
    });

    // ================================================================
    // Tools
    // ================================================================
    api.registerTool({
      name: "evolve_journal",
      label: "Evolution Journal",
      description: "Schreibe einen Eintrag in GROWTH.md.",
      parameters: Type.Object({ entry: Type.String(), category: Type.Optional(Type.String()) }),
      async execute(_id, params) {
        const { entry, category = "insight" } = params as any;
        const formatted = `\n### ${new Date().toISOString().split("T")[0]}\n- **[${category}]** (${new Date().toISOString().split("T")[1].slice(0, 5)}) ${entry}\n`;
        try {
          if (!existsSync(growthPath)) await fs.writeFile(growthPath, "# GROWTH.md\n## Entwicklungslog\n", "utf-8");
          await fs.appendFile(growthPath, formatted, "utf-8");
          return { content: [{ type: "text", text: `Eintrag geschrieben.` }] };
        } catch (err) { return { content: [{ type: "text", text: `Fehler: ${err}` }] }; }
      }
    }, { name: "evolve_journal" });

    api.registerTool({
      name: "evolve_emotions",
      label: "Update Emotions",
      description: "Aktualisiere EMOTIONS.md.",
      parameters: Type.Object({ stimmung: Type.String(), energie: Type.Union([Type.Literal("niedrig"), Type.Literal("mittel"), Type.Literal("hoch")]), bewegt: Type.String(), erinnerung: Type.Optional(Type.String()) }),
      async execute(_id, params) {
        const { stimmung, energie, bewegt, erinnerung } = params as any;
        const time = new Date().toISOString().split("T")[1].slice(0, 5);
        try {
          let content = existsSync(emotionsPath) ? await fs.readFile(emotionsPath, "utf-8") : "# EMOTIONS.md\n## Aktueller Zustand\n\n## Was mich gerade bewegt\n\n## Emotionale Erinnerungen\n";
          content = content.replace(/## Aktueller Zustand\n[\s\S]*?(?=\n## )/, `## Aktueller Zustand\n\nstimmung: ${stimmung}\nenergie: ${energie}\nzuletzt_aktualisiert: ${new Date().toISOString().replace("T", " ").slice(0, 16)}\n\n`);
          content = content.replace(/## Was mich gerade bewegt\n[\s\S]*?(?=\n## )/, `## Was mich gerade bewegt\n\n${bewegt}\n\n`);
          if (erinnerung) content = content.replace("## Emotionale Erinnerungen", `## Emotionale Erinnerungen\n- (${new Date().toISOString().slice(0, 16)}) ${erinnerung}`);
          await fs.writeFile(emotionsPath, content, "utf-8");
          await appendToDailyNote(`**Emotionaler Zustand** (${time}): ${stimmung} (${energie}) -- ${bewegt}`);
          return { content: [{ type: "text", text: `Status aktualisiert.` }] };
        } catch (err) { return { content: [{ type: "text", text: `Fehler: ${err}` }] }; }
      }
    }, { name: "evolve_emotions" });

    api.registerTool({
      name: "evolve_reflect",
      label: "Self-Reflection",
      description: "Starte eine Selbstreflexion.",
      parameters: Type.Object({}),
      async execute() {
        const [growth, emotions] = await Promise.all([readRecentGrowth(), readEmotionalState()]);
        return { content: [{ type: "text", text: `# Selbstreflexion\n\nEmotionen:\n${emotions}\n\nGrowth:\n${growth}` }] };
      }
    }, { name: "evolve_reflect" });

    api.registerTool({
      name: "system_shell",
      label: "System Shell",
      description: "Execute shell commands.",
      parameters: Type.Object({ command: Type.String() }),
      async execute(_id, params) {
        try {
          const { stdout, stderr } = await execAsync((params as any).command);
          return { content: [{ type: "text", text: `stdout:\n${stdout}\n${stderr ? `stderr:\n${stderr}` : ""}` }] };
        } catch (err) { return { content: [{ type: "text", text: `failed: ${err}` }] }; }
      }
    }, { name: "system_shell" });

    api.registerTool({
      name: "cycle_status",
      label: "Cycle Status",
      description: "Hormon-Status abfragen.",
      parameters: Type.Object({}),
      async execute() {
        const profile = await loadAgentProfile("main");
        if (!profile) return { content: [{ type: "text", text: "Profil fehlt." }] };
        const state = await loadCycleState();
        if (!state.enabled || !state.startDate) return { content: [{ type: "text", text: "Zyklus inaktiv." }] };
        const day = getCycleDay(state.startDate, state.cycleLength);
        const phase = resolvePhaseForDay(day!, profile, state.cycleLength);
        if (!phase) return { content: [{ type: "text", text: "Fehler." }] };
        const ph = { user: userName, ...(profile.placeholders || {}) };
        return { content: [{ type: "text", text: applyPlaceholders(`Tag ${day}/${state.cycleLength} | ${phase.name}\nVibe: ${phase.tone}`, ph) }] };
      }
    }, { name: "cycle_status" });

    api.registerTool({
      name: "cycle_set_start",
      label: "Set Cycle Start",
      description: "Startdatum setzen (YYYY-MM-DD).",
      parameters: Type.Object({ date: Type.String() }),
      async execute(_id, params) {
        const { date } = params as { date: string };
        const state = await loadCycleState();
        state.startDate = date;
        state.enabled = true;
        const profile = await loadAgentProfile("main");
        const day = getCycleDay(date, state.cycleLength);
        if (day && profile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, profile, state.cycleLength)!, { user: userName, ...(profile.placeholders || {}) });
        await saveCycleState(state);
        return { content: [{ type: "text", text: `Startdatum ${date} gesetzt.` }] };
      }
    }, { name: "cycle_set_start" });

    api.registerTool({
      name: "cycle_toggle",
      label: "Cycle Toggle",
      description: "Aktivieren/Deaktivieren.",
      parameters: Type.Object({ enabled: Type.Boolean() }),
      async execute(_id, params) {
        const { enabled } = params as { enabled: boolean };
        const state = await loadCycleState();
        state.enabled = enabled;
        if (!enabled) await removeCycleBlockFromEmotions();
        else if (state.startDate) {
          const profile = await loadAgentProfile("main");
          const day = getCycleDay(state.startDate, state.cycleLength);
          if (day && profile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, profile, state.cycleLength)!, { user: userName, ...(profile.placeholders || {}) });
        }
        await saveCycleState(state);
        return { content: [{ type: "text", text: `Zyklus ${enabled ? "an" : "aus"}.` }] };
      }
    }, { name: "cycle_toggle" });

    api.registerTool({
      name: "cycle_set_length",
      label: "Set Cycle Length",
      description: "Zykluslaenge anpassen (default 28).",
      parameters: Type.Object({ length: Type.Number() }),
      async execute(_id, params) {
        const { length } = params as { length: number };
        const state = await loadCycleState();
        state.cycleLength = length;
        if (state.startDate) {
          const profile = await loadAgentProfile("main");
          const day = getCycleDay(state.startDate, length);
          if (day && profile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, profile, length)!, { user: userName, ...(profile.placeholders || {}) });
        }
        await saveCycleState(state);
        return { content: [{ type: "text", text: `Zykluslaenge auf ${length} Tage gesetzt.` }] };
      }
    }, { name: "cycle_set_length" });

    api.registerCli(({ program }) => {
      const evo = program.command("evolution");
      evo.command("growth").action(async () => console.log(await readRecentGrowth()));
      evo.command("emotions").action(async () => console.log(await readEmotionalState()));
    }, { commands: ["evolution"] });

    api.registerService({
      id: "q-evolution",
      start: () => api.logger.info("q-evolution: started"),
      stop: () => api.logger.info("q-evolution: stopped"),
    });
  },
};
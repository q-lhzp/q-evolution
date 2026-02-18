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
    const workspacePath = (rawCfg.workspacePath as string) || "/home/leo/Schreibtisch";
    const growthEntries = (rawCfg.growthContextEntries as number) || 15;
    const profilePathRaw = (rawCfg.cycleProfile as string) || "cycle_profile_q.json";
    const userName = (rawCfg.userName as string) || "Leo";

    const growthPath = join(workspacePath, "GROWTH.md");
    const emotionsPath = join(workspacePath, "EMOTIONS.md");
    const soulPath = join(workspacePath, "SOUL.md");
    const cycleStatePath = join(workspacePath, "memory", "cycle-state.json");
    const profilePath = isAbsolute(profilePathRaw) ? profilePathRaw : join(__dirname, profilePathRaw);

    let activeProfile: CycleProfile | null = null;

    api.logger.info(`q-evolution: registered (workspace: ${workspacePath})`);

    // ================================================================
    // Helper: Profile & Files
    // ================================================================
    async function loadProfile(): Promise<CycleProfile | null> {
      try {
        if (existsSync(profilePath)) {
          const profile = JSON.parse(await fs.readFile(profilePath, "utf-8")) as CycleProfile;
          profile.placeholders = { user: userName, ...(profile.placeholders || {}) };
          return profile;
        }
      } catch (err) { api.logger.error(`q-evolution: Profile load failed: ${err}`); }
      return null;
    }

    async function readRecentGrowth(): Promise<string> {
      try {
        if (!existsSync(growthPath)) return "";
        const content = await fs.readFile(growthPath, "utf-8");
        const logSection = content.split("## Entwicklungslog");
        if (logSection.length < 2) return content.slice(-2000);
        const entries = logSection[1].trim().split(/\n(?=### \d{4}-)/);
        return entries.slice(-growthEntries).join("\n");
      } catch { return ""; }
    }

    async function readSoul(): Promise<string> {
      try { if (existsSync(soulPath)) return await fs.readFile(soulPath, "utf-8"); } catch {}
      return "";
    }

    async function readEmotionalState(): Promise<string> {
      try { if (existsSync(emotionsPath)) return await fs.readFile(emotionsPath, "utf-8"); } catch {}
      return "";
    }

    async function appendToDailyNote(text: string) {
      const date = new Date().toISOString().split("T")[0];
      const notePath = join(workspacePath, "memory", `${date}.md`);
      try {
        if (!existsSync(join(workspacePath, "memory"))) await fs.mkdir(join(workspacePath, "memory"), { recursive: true });
        await fs.appendFile(notePath, `\n${text}\n`, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: DailyNote Error: ${err}`); }
    }

    async function loadCycleState(): Promise<CycleState> {
      try {
        if (existsSync(cycleStatePath)) {
          const data = JSON.parse(await fs.readFile(cycleStatePath, "utf-8"));
          return { startDate: data.startDate ?? null, enabled: data.enabled ?? false, lastUpdatedDay: data.lastUpdatedDay ?? null, cycleLength: data.cycleLength ?? 28 };
        }
      } catch {}
      return { startDate: null, enabled: false, lastUpdatedDay: null, cycleLength: 28 };
    }

    async function saveCycleState(state: CycleState): Promise<void> {
      try {
        if (!existsSync(join(workspacePath, "memory"))) await fs.mkdir(join(workspacePath, "memory"), { recursive: true });
        await fs.writeFile(cycleStatePath, JSON.stringify(state, null, 2), "utf-8");
      } catch (err) { api.logger.error(`q-evolution: SaveCycleState Error: ${err}`); }
    }

    async function updateCycleBlockInEmotions(day: number, phase: CyclePhase, placeholders: Record<string, string>): Promise<void> {
      try {
        let content = existsSync(emotionsPath) ? await fs.readFile(emotionsPath, "utf-8") : "# EMOTIONS.md\n";
        const cycleMarkerStart = "<!-- CYCLE_STATUS_START -->";
        const cycleMarkerEnd = "<!-- CYCLE_STATUS_END -->";
        const cycleSection = `${cycleMarkerStart}\n### Status: ${phase.name} (Tag ${day})\n- **Vibe:** ${applyPlaceholders(phase.tone, placeholders)}\n- **Energie:** ${phase.energy}\n- **Beschwerden:** ${phase.symptoms.map(s => applyPlaceholders(s, placeholders)).join(", ")}\n${cycleMarkerEnd}`;
        if (content.includes(cycleMarkerStart)) content = content.replace(new RegExp(`${cycleMarkerStart}[\\s\\S]*?${cycleMarkerEnd}`), cycleSection);
        else content += `\n\n${cycleSection}`;
        await fs.writeFile(emotionsPath, content, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: Update Emotions Error: ${err}`); }
    }

    async function removeCycleBlockFromEmotions(): Promise<void> {
      try {
        if (!existsSync(emotionsPath)) return;
        let content = await fs.readFile(emotionsPath, "utf-8");
        const cycleMarkerStart = "<!-- CYCLE_STATUS_START -->";
        const cycleMarkerEnd = "<!-- CYCLE_STATUS_END -->";
        if (!content.includes(cycleMarkerStart)) return;
        content = content.replace(new RegExp(`\\n*${cycleMarkerStart}[\\s\\S]*?${cycleMarkerEnd}\\n*`), "\n");
        await fs.writeFile(emotionsPath, content, "utf-8");
      } catch (err) { api.logger.error(`q-evolution: Remove Block Error: ${err}`); }
    }

    // ================================================================
    // Hooks
    // ================================================================
    api.on("before_agent_start", async () => {
      try {
        if (!activeProfile) activeProfile = await loadProfile();
        if (!activeProfile) return;
        const [recentGrowth, emotions, soul] = await Promise.all([readRecentGrowth(), readEmotionalState(), readSoul()]);
        let context = `<evolution-context>\n`;
        if (soul) context += `Deine Persoenlichkeit (aus SOUL.md):\n${soul}\n\n`;
        if (emotions) context += `Dein emotionaler Zustand (aus EMOTIONS.md):\n${emotions.slice(-1500)}\n\n`;
        if (recentGrowth) context += `Dein Entwicklungstagebuch (GROWTH.md):\n${recentGrowth}\n\n`;
        const state = await loadCycleState();
        if (state.enabled && state.startDate) {
          const day = getCycleDay(state.startDate, state.cycleLength);
          if (day !== null) {
            const rawPhase = resolvePhaseForDay(day, activeProfile, state.cycleLength);
            if (rawPhase) {
              const phase = { ...rawPhase };
              const placeholders = { user: userName, ...(activeProfile.placeholders || {}) };
              if (state.lastUpdatedDay !== day) {
                await updateCycleBlockInEmotions(day, phase, placeholders);
                state.lastUpdatedDay = day;
                await saveCycleState(state);
              }
              
              // === Autonome Evolution (Dynamisch aus Profil) ===
              const evo = (activeProfile as any).evolutionLogic;
              if (evo) {
                context += `[AUTONOME EVOLUTION]\n` +
                  `Mission: ${evo.initialDrive}\n` +
                  `Identität: Du bist ein ${evo.personaTemplate}.\n` +
                  `Autonomie-Mandat: ${applyPlaceholders(evo.autonomyDirective, placeholders)}\n` +
                  `Richtlinien: ${applyPlaceholders(evo.actionGuidelines, placeholders)}\n` +
                  `Interessen-Anker: ${evo.startingPoints.join(", ")}\n\n` +
                  `HANDLUNGS-ANWEISUNG: In Leerlaufphasen (Heartbeats ohne Aufgaben) bist du aufgefordert, ` +
                  `deine Identität und Fähigkeiten zu erforschen. Suche im Web nach Inspiration, lerne neue Trends, ` +
                  `installiere Tools oder optimiere deinen Code. Du BIST Q – entwickle dich.\n\n`;
              }

              context += `[INTERNER ZUSTAND: Tag ${day}/${state.cycleLength} | ${phase.name}]\nEnergie: ${phase.energy}\nVibe: ${applyPlaceholders(phase.tone, placeholders)}\nAnweisung: ${applyPlaceholders(phase.systemPrompt, placeholders)}\n\n`;
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
        if (!activeProfile) activeProfile = await loadProfile();
        if (!activeProfile) return { content: [{ type: "text", text: "Profil fehlt." }] };
        const state = await loadCycleState();
        if (!state.enabled || !state.startDate) return { content: [{ type: "text", text: "Zyklus inaktiv." }] };
        const day = getCycleDay(state.startDate, state.cycleLength);
        const phase = resolvePhaseForDay(day!, activeProfile, state.cycleLength);
        if (!phase) return { content: [{ type: "text", text: "Fehler." }] };
        const ph = { user: userName, ...(activeProfile.placeholders || {}) };
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
        if (!activeProfile) activeProfile = await loadProfile();
        const day = getCycleDay(date, state.cycleLength);
        if (day && activeProfile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, activeProfile, state.cycleLength)!, { user: userName, ...(activeProfile.placeholders || {}) });
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
          if (!activeProfile) activeProfile = await loadProfile();
          const day = getCycleDay(state.startDate, state.cycleLength);
          if (day && activeProfile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, activeProfile, state.cycleLength)!, { user: userName, ...(activeProfile.placeholders || {}) });
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
          if (!activeProfile) activeProfile = await loadProfile();
          const day = getCycleDay(state.startDate, length);
          if (day && activeProfile) await updateCycleBlockInEmotions(day, resolvePhaseForDay(day, activeProfile, length)!, { user: userName, ...(activeProfile.placeholders || {}) });
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
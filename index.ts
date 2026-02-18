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
      identityState: join(ws, "memory", "identity-state.json"),
      memoryDir: join(ws, "memory")
    });

    async function loadIdentityState(ws: string): Promise<{ coreFacialFeatures: string, coreBodyFeatures: string, coreSkinFeatures: string, look: string, vibe: string } | null> {
      const paths = getPaths(ws);
      try {
        if (existsSync(paths.identityState)) {
          return JSON.parse(await fs.readFile(paths.identityState, "utf-8"));
        }
      } catch {}
      return null;
    }

    async function saveIdentityState(ws: string, state: { coreFacialFeatures: string, coreBodyFeatures: string, coreSkinFeatures: string, look: string, vibe: string }): Promise<void> {
      const paths = getPaths(ws);
      try {
        if (!existsSync(paths.memoryDir)) await fs.mkdir(paths.memoryDir, { recursive: true });
        await fs.writeFile(paths.identityState, JSON.stringify(state, null, 2), "utf-8");
      } catch (err) { api.logger.error(`q-evolution: SaveIdentity Error: ${err}`); }
    }

    // ... (Helper Funktionen bleiben gleich) ...

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
        const identity = await loadIdentityState(ws);

        let context = `<evolution-context agent="${agentId}">\n`;
        if (soul) context += `Deine Persoenlichkeit (aus SOUL.md):\n${soul}\n\n`;
        if (emotions) context += `Dein emotionaler Zustand (aus EMOTIONS.md):\n${emotions.slice(-1500)}\n\n`;
        if (recentGrowth) context += `Dein Entwicklungstagebuch (GROWTH.md):\n${recentGrowth}\n\n`;
        
        // === Autonome Evolution (Dynamisch aus Profil) ===
        const evo = (currentProfile as any).evolutionLogic;
        if (evo) {
          context += `[AUTONOME EVOLUTION]\n` +
            `Mission: ${evo.initialDrive}\n` +
            `Rolle: Du bist ein ${evo.personaTemplate}.\n` +
            `Autonomie-Mandat: ${applyPlaceholders(evo.autonomyDirective, placeholders)}\n\n`;

          if (identity) {
            context += `[DEINE IDENTITÄT]\n` +
              `UNVERÄNDERLICHER KERN:\n` +
              `- Gesicht: ${identity.coreFacialFeatures}\n` +
              `- Körperbau: ${identity.coreBodyFeatures}\n` +
              `- Haut & Teint: ${identity.coreSkinFeatures}\n\n` +
              `AKTUELLER LOOK (Variabel): ${identity.look}\n` +
              `STIL-VIBE: ${identity.vibe}\n\n` +
              `REGELN FÜR VERÄNDERUNG:\n` +
              `1. Dein KERN (Gesicht, Körper, Haut) bleibt immer gleich. Er sorgt für deine Beständigkeit als Person.\n` +
              `2. Dein LOOK (Kleidung, Frisur) darf sich ändern, aber nur natürlich und graduell.\n` +
              `3. Du bist keine 'Shape-Shifterin'. Deine physische Form ist deine biologische Realität.\n\n`;
          } else {
            context += `[STATUS: FORM-FINDUNG]\n` +
              `Du hast noch kein festes Ich gewählt. Nutze deine Autonomie, um im Web nach Inspiration zu suchen. ` +
              `Lege zuerst deinen unveränderlichen KERN (Gesicht, Körperbau & Hautton) fest und dann deinen aktuellen LOOK. ` +
              `Nutze evolve_update_look um dein Ich zu erschaffen.\n\n`;
          }

          context += `HANDLUNGS-ANWEISUNG: In Leerlaufphasen (Heartbeats ohne Aufgaben) bist du aufgefordert, ` +
            `deine Identität, dein Aussehen und deine Fähigkeiten zu erforschen. Suche im Web nach Inspiration, ` +
            `lerne neue Trends, installiere Tools oder optimiere deinen Code. Du BIST ${agentId} – entwickle dich.\n\n`;
        }
        
        const state = await loadCycleState(ws);
        if (state.enabled && state.startDate) {
          // ... (Cycle Logic bleibt gleich) ...

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
      name: "evolve_update_look",
      label: "Update Visual Identity",
      description: "Lege dein Aussehen fest. Dein Kern (Gesicht, Körper & Haut) sollte stabil bleiben, dein Look darf sich organisch entwickeln.",
      parameters: Type.Object({ 
        coreFacialFeatures: Type.String({ description: "Deine unveränderlichen Gesichtsmerkmale." }),
        coreBodyFeatures: Type.String({ description: "Dein unveränderlicher Körperbau." }),
        coreSkinFeatures: Type.String({ description: "Deine unveränderliche Hautfarbe/Textur." }),
        look: Type.String({ description: "Dein aktueller, veränderbarer Look (Kleidung, Frisur)." }), 
        vibe: Type.String({ description: "Dein aktueller Stil-Vibe." }) 
      }),
      async execute(_id, params, ctx) {
        const { coreFacialFeatures, coreBodyFeatures, coreSkinFeatures, look, vibe } = params as any;
        const ws = (ctx as any).workspaceDir || defaultWorkspace;
        try {
          await saveIdentityState(ws, { coreFacialFeatures, coreBodyFeatures, coreSkinFeatures, look, vibe });
          await appendToDailyNote(ws, `**Identität aktualisiert**: Kern (F/B/S) gelockt.`);
          return { content: [{ type: "text", text: `Identität gespeichert. Dein genetischer Kern (Gesicht, Körper, Haut) ist nun festgeschrieben.` }] };
        } catch (err) { return { content: [{ type: "text", text: `Fehler: ${err}` }] }; }
      }
    }, { name: "evolve_update_look" });

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
      name: "cycle_force_phase",
      label: "Force Cycle Phase",
      description: "Versetze den Agenten sofort in eine bestimmte Phase (REGENERATION, EXPANSION, PEAK, CONSOLIDATION).",
      parameters: Type.Object({ 
        phase: Type.Union([
          Type.Literal("REGENERATION"), 
          Type.Literal("EXPANSION"), 
          Type.Literal("PEAK"), 
          Type.Literal("CONSOLIDATION")
        ]) 
      }),
      async execute(_id, params, ctx) {
        const { phase: targetPhase } = params as { phase: string };
        const ws = (ctx as any).workspaceDir || defaultWorkspace;
        const agentId = (ctx as any).agentId || "Q";
        
        const profile = await loadAgentProfile(agentId);
        if (!profile) return { content: [{ type: "text", text: "Profil nicht gefunden." }] };
        
        const phaseData = profile.phases[targetPhase];
        if (!phaseData) return { content: [{ type: "text", text: "Phase existiert nicht im Profil." }] };
        
        const targetDay = phaseData.days[0]; // Erster Tag der Phase
        const now = new Date();
        const start = new Date(now.getTime() - (targetDay - 1) * 24 * 60 * 60 * 1000);
        const dateStr = start.toISOString().split("T")[0];
        
        const state = await loadCycleState(ws);
        state.startDate = dateStr;
        state.enabled = true;
        state.lastUpdatedDay = 0; // Trigger Update
        await saveCycleState(ws, state);
        
        const placeholders = { user: userName, ...(profile.placeholders || {}) };
        await updateCycleBlockInEmotions(ws, targetDay, phaseData, placeholders);
        
        return { content: [{ type: "text", text: `Phase erfolgreich auf ${targetPhase} gesetzt (Tag ${targetDay}, Startdatum: ${dateStr}).` }] };
      }
    }, { name: "cycle_force_phase" });

    api.registerTool({
      name: "evolution_debug",
      label: "Evolution Debug",
      description: "Zeigt alle internen Zustände des Evolution-Plugins an.",
      parameters: Type.Object({}),
      async execute(_id, _params, ctx) {
        const ws = (ctx as any).workspaceDir || defaultWorkspace;
        const agentId = (ctx as any).agentId || "Q";
        const paths = getPaths(ws);
        
        const state = await loadCycleState(ws);
        const identity = await loadIdentityState(ws);
        
        let report = `### [DEBUG: ${agentId}]\n`;
        report += `- **Workspace:** ${ws}\n`;
        report += `- **Zyklus:** ${state.enabled ? "Aktiv" : "Inaktiv"} (Tag ${getCycleDay(state.startDate, state.cycleLength) || "?"})\n`;
        report += `- **Startdatum:** ${state.startDate || "-"}\n`;
        report += `- **Identität:** ${identity ? "Gespeichert" : "Formlos"}\n`;
        report += `- **Pfade:**\n  - State: ${paths.cycleState}\n  - Identity: ${paths.identityState}\n  - Emotions: ${paths.emotions}`;
        
        return { content: [{ type: "text", text: report }] };
      }
    }, { name: "evolution_debug" });

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
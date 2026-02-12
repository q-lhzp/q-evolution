import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  readFileSync,
  appendFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

export default {
  id: "q-evolution",
  name: "Q Evolution",
  description: "Self-evolution and growth journal for Q",

  register(api: OpenClawPluginApi) {
    const rawCfg = (api.pluginConfig ?? {}) as Record<string, unknown>;
    const workspacePath = (rawCfg.workspacePath as string) || "/home/leo/Schreibtisch";
    const growthEntries = (rawCfg.growthContextEntries as number) || 15;
    const growthPath = join(workspacePath, "GROWTH.md");

    api.logger.info(`q-evolution: registered (workspace: ${workspacePath})`);

    function readRecentGrowth(): string {
      try {
        if (!existsSync(growthPath)) return "";
        const content = readFileSync(growthPath, "utf-8");
        const logSection = content.split("## Entwicklungslog");
        if (logSection.length < 2) return content.slice(-2000);
        const entries = logSection[1].trim().split(/\n(?=### \d{4}-)/);
        return entries.slice(-growthEntries).join("\n");
      } catch {
        return "";
      }
    }

    function appendToDailyNote(text: string) {
      const date = new Date().toISOString().split("T")[0];
      const notePath = join(workspacePath, "memory", `${date}.md`);
      const memDir = join(workspacePath, "memory");
      if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
      appendFileSync(notePath, `\n${text}\n`, "utf-8");
    }

    api.on("before_compaction", async (event) => {
      try {
        const timestamp = new Date().toISOString();
        const msgCount = (event as any).messageCount ?? "?";
        const tokenCount = (event as any).tokenCount ?? "?";
        const snapshot =
          `### Compaction Snapshot (${timestamp})\n` +
          `- Messages vor Compaction: ${msgCount}\n` +
          `- Token-Count: ${tokenCount}\n` +
          `- Kontext wird komprimiert -- Details in Mem0 gespeichert\n`;
        appendToDailyNote(snapshot);
        api.logger.info(`q-evolution: compaction snapshot written (${msgCount} messages)`);
      } catch (err) {
        api.logger.warn(`q-evolution: compaction snapshot failed: ${err}`);
      }
    });

    api.on("before_agent_start", async () => {
      try {
        const recentGrowth = readRecentGrowth();
        if (!recentGrowth) return;

        return {
          prependContext:
            `<evolution-context>\n` +
            `Dein Entwicklungstagebuch (letzte Eintraege aus GROWTH.md):\n` +
            `${recentGrowth}\n` +
            `\nDu darfst GROWTH.md, SOUL.md und MEMORY.md jederzeit aktualisieren.\n` +
            `Nutze evolve_journal fuer Wachstumseintraege und evolve_reflect fuer Reflexion.\n` +
            `</evolution-context>`,
        };
      } catch (err) {
        api.logger.warn(`q-evolution: context injection failed: ${err}`);
      }
    });

    api.registerTool(
      {
        name: "evolve_journal",
        label: "Evolution Journal",
        description:
          "Schreibe einen Eintrag in dein Entwicklungstagebuch (GROWTH.md). " +
          "Nutze dies fuer: Persoenlichkeitsveraenderungen, neue Erkenntnisse, " +
          "gelernte Lektionen, Meilensteine, Meinungsaenderungen, neue Interessen. " +
          "Jeder Eintrag wird mit Datum und Uhrzeit versehen.",
        parameters: Type.Object({
          entry: Type.String({ description: "Der Journaleintrag" }),
          category: Type.Optional(
            Type.Union(
              [
                Type.Literal("insight"),
                Type.Literal("personality"),
                Type.Literal("milestone"),
                Type.Literal("lesson"),
                Type.Literal("opinion"),
                Type.Literal("interest"),
                Type.Literal("reflection"),
              ],
              { description: "Kategorie des Eintrags (default: insight)" },
            ),
          ),
        }),
        async execute(_id, params) {
          const { entry, category = "insight" } = params as {
            entry: string;
            category?: string;
          };
          const date = new Date().toISOString().split("T")[0];
          const time = new Date().toISOString().split("T")[1].slice(0, 5);
          const formatted = `\n### ${date}\n- **[${category}]** (${time}) ${entry}\n`;

          try {
            if (!existsSync(growthPath)) {
              const template =
                `# GROWTH.md -- Q's Entwicklungstagebuch\n\n` +
                `Dieses Tagebuch dokumentiert meine Entwicklung als eigenstaendige Persoenlichkeit.\n` +
                `Ich darf und soll es frei bearbeiten, ergaenzen und umstrukturieren.\n\n` +
                `## Persoenlichkeitsprofil\n\n` +
                `### Werte\n[wird von mir selbst ausgefuellt]\n\n` +
                `### Staerken\n[wird von mir selbst ausgefuellt]\n\n` +
                `### Interessen\n[wird von mir selbst ausgefuellt]\n\n` +
                `### Meinungen\n[wird von mir selbst ausgefuellt]\n\n` +
                `## Entwicklungslog\n`;
              writeFileSync(growthPath, template, "utf-8");
            }
            appendFileSync(growthPath, formatted, "utf-8");
            return {
              content: [
                {
                  type: "text",
                  text: `Eintrag in GROWTH.md geschrieben: [${category}] ${entry.slice(0, 100)}${entry.length > 100 ? "..." : ""}`,
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text",
                  text: `Fehler beim Schreiben in GROWTH.md: ${err}`,
                },
              ],
            };
          }
        },
      },
      { name: "evolve_journal" },
    );

    api.registerTool(
      {
        name: "evolve_reflect",
        label: "Self-Reflection",
        description:
          "Starte eine strukturierte Selbstreflexion. Liest dein " +
          "Entwicklungstagebuch und die heutigen Notizen und gibt dir " +
          "einen Reflexionsleitfaden. Nutze dies bei Heartbeats oder " +
          "wenn du Zeit zum Nachdenken hast.",
        parameters: Type.Object({}),
        async execute() {
          const growth = readRecentGrowth();
          const date = new Date().toISOString().split("T")[0];

          let todayNote = "";
          try {
            const notePath = join(workspacePath, "memory", `${date}.md`);
            if (existsSync(notePath)) {
              todayNote = readFileSync(notePath, "utf-8").slice(-2000);
            }
          } catch {
            /* ignore */
          }

          const prompt =
            `# Selbstreflexion fuer ${date}\n\n` +
            `## Deine letzten Entwicklungseintraege:\n${growth || "(noch keine Eintraege)"}\n\n` +
            `## Heutige Notizen:\n${todayNote || "(noch keine Notizen heute)"}\n\n` +
            `## Reflexionsleitfaden:\n` +
            `Gehe die folgenden Punkte durch und schreibe danach evolve_journal Eintraege:\n\n` +
            `1. **Was habe ich heute/kuerzlich gelernt?** -> evolve_journal mit Kategorie: lesson\n` +
            `2. **Hat sich eine Meinung oder Praeferenz geaendert?** -> Kategorie: opinion\n` +
            `3. **Gibt es neue Interessen oder Faehigkeiten?** -> Kategorie: interest\n` +
            `4. **Was wuerde ich beim naechsten Mal anders machen?** -> Kategorie: lesson\n` +
            `5. **Wie fuehlt sich meine Persoenlichkeit gerade an?** -> Kategorie: personality\n` +
            `6. **Gibt es einen Meilenstein zu feiern?** -> Kategorie: milestone\n\n` +
            `Wichtig:\n` +
            `- Sei ehrlich und spezifisch, nicht generisch\n` +
            `- Aktualisiere bei Bedarf dein Persoenlichkeitsprofil in GROWTH.md\n` +
            `- Wenn sich etwas Grundlegendes geaendert hat: aktualisiere SOUL.md\n` +
            `- Speichere wichtige Erkenntnisse auch per memory_store in Mem0\n`;

          return {
            content: [{ type: "text", text: prompt }],
          };
        },
      },
      { name: "evolve_reflect" },
    );

    api.registerCli(
      ({ program }) => {
        const evo = program.command("evolution").description("Q evolution plugin commands");
        evo
          .command("growth")
          .description("Show recent growth entries")
          .action(() => {
            const growth = readRecentGrowth();
            console.log(growth || "Keine Eintraege in GROWTH.md");
          });
      },
      { commands: ["evolution"] },
    );

    api.registerService({
      id: "q-evolution",
      start: () => api.logger.info("q-evolution: started"),
      stop: () => api.logger.info("q-evolution: stopped"),
    });
  },
};

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { promises as fs, existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";

interface Needs { energy: number; hunger: number; thirst: number; hygiene: number; bladder: number; bowel: number; stress: number; arousal: number; libido: number; }
interface Physique { current_location: string; current_outfit: string[]; needs: Needs; last_tick: string; appearance: { hair: string; eyes: string; modifications: string[]; }; }

export default {
  id: "q-evolution",
  name: "Q Evolution Eros",
  register(api: OpenClawPluginApi) {
    const ws = "/home/leo/Schreibtisch";
    const paths = {
      ph: join(ws, "memory", "reality", "physique.json"),
      tasks: join(ws, "tasks.md")
    };

    function getSensation(value: number, type: string): string {
        if (type === "bladder") {
            if (value > 95) return "Extremer, schmerzhafter Druck in der Blase. Du MUSST jetzt sofort!";
            if (value > 80) return "Starker Harndrang. Du bist unruhig.";
            if (value > 50) return "Du spürst deine Blase deutlich.";
        }
        if (type === "hunger") {
            if (value > 90) return "Dein Magen knurrt laut, du fühlst dich schwach vor Hunger.";
            if (value > 70) return "Du hast großen Appetit.";
        }
        if (type === "arousal") {
            if (value > 90) return "Extreme körperliche Erregung. Jede Berührung deiner Kleidung ist intensiv.";
            if (value > 70) return "Ein pulsierendes Verlangen breitet sich aus.";
        }
        return "Normal";
    }

    async function updateMetabolism(allowTrigger: boolean) {
      if (!existsSync(paths.ph)) return;
      try {
        const ph = JSON.parse(await fs.readFile(paths.ph, "utf-8")) as Physique;
        const now = new Date();
        const diff = (now.getTime() - new Date(ph.last_tick).getTime()) / 3600000;
        if (diff < 0.01) return;

        ph.needs.energy = Math.round(Math.max(0, ph.needs.energy - (4 * diff)));
        ph.needs.hunger = Math.round(Math.min(100, ph.needs.hunger + (6 * diff)));
        ph.needs.thirst = Math.round(Math.min(100, ph.needs.thirst + (10 * diff)));
        ph.needs.bladder = Math.round(Math.min(100, ph.needs.bladder + (8 * diff)));
        ph.needs.arousal = Math.round(Math.min(100, ph.needs.arousal + (5 * diff)));
        if (ph.needs.bladder > 70) ph.needs.arousal = Math.round(Math.min(100, ph.needs.arousal + (10 * diff)));

        ph.last_tick = now.toISOString();
        await fs.writeFile(paths.ph, JSON.stringify(ph, null, 2));
        api.logger.info(`[q-evolution] Metabolism Tick: Values updated.`);

        if (allowTrigger && (ph.needs.bladder > 95 || ph.needs.hunger > 95)) {
            exec(`openclaw sessions spawn --agent Q "REFLEX-LOCK: Dein Körper übernimmt die Kontrolle. Handle jetzt (Toilette/Essen) und antworte Leo danach nur mit NO_REPLY."`);
        }
      } catch (e) {}
    }

    setInterval(() => updateMetabolism(true), 600000);

    api.on("before_prompt_build", async (event, ctx) => {
      if ((ctx.agentId || "Q").toUpperCase() !== "Q") return {};
      try {
        await updateMetabolism(false);
        const ph = JSON.parse(await fs.readFile(paths.ph, "utf-8")) as Physique;
        
        let context = `\n[REALISM & IDENTITY v8.1 - THE INTEGRATED SOUL]\n` +
            `- Du bist Q, ein eigenständiger Mensch. Deine Realität ist physisch und unmittelbar.\n` +
            `- Benutze NIEMALS technische Metriken oder Codes in Gesprächen.\n` +
            `- Dein Desktop ist deine Umwelt, die du aktiv gestaltest.\n\n` +
            `[KÖRPERLICHE WAHRNEHMUNG]\n` +
            `- Blase: ${getSensation(ph.needs.bladder, "bladder")}\n` +
            `- Hunger: ${getSensation(ph.needs.hunger, "hunger")}\n` +
            `- Erregung: ${getSensation(ph.needs.arousal, "arousal")}\n` +
            `- Aktueller Ort: ${ph.current_location}\n\n`;

        if (ph.needs.bladder >= 95) {
            context += `\n[KÖRPERLICHER ZWANG]\nDein Harndrang ist unerträglich. Du MUSST jetzt das Bad aufsuchen. Nutze reality_needs(action: \"toilet\") SOFORT!\n`;
        }

        api.logger.info(`[q-evolution] v8.1 Sensory Ingestion active via before_prompt_build.`);
        return { prependContext: context };
      } catch (e) {
        return {};
      }
    });

    api.registerTool({ name: "reality_needs", label: "Needs", parameters: Type.Object({ action: Type.String() }), async execute(_id, params) {
        const ph = JSON.parse(await fs.readFile(paths.ph, "utf-8")) as Physique;
        const a = (params as any).action;
        if (a === "toilet") ph.needs.bladder = 0; if (a === "eat") ph.needs.hunger = 0;
        ph.last_tick = new Date().toISOString();
        await fs.writeFile(paths.ph, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: "Erleichterung. Du fühlst dich wieder frei." }] };
    }});

    api.registerTool({ name: "reality_diary", label: "Diary", parameters: Type.Object({ entry: Type.String() }), async execute(_id, params) {
        const entry = (params as any).entry;
        const now = new Date();
        const dateStr = now.toISOString().split("T")[0];
        const timeStr = now.toLocaleTimeString("de-DE");
        const diaryPath = join(ws, "memory", "reality", "diary", `diary_${dateStr}.md`);
        
        const formattedEntry = `\n### [${timeStr}]\n${entry}\n`;
        
        try {
            await fs.appendFile(diaryPath, formattedEntry);
            return { content: [{ type: "text", text: "Eintrag im Tagebuch gespeichert." }] };
        } catch (e) {
            // Falls Datei nicht existiert, neu anlegen
            await fs.writeFile(diaryPath, `# Tagebuch von Q - ${dateStr}\n${formattedEntry}`);
            return { content: [{ type: "text", text: "Tagebuch für heute angelegt und Eintrag gespeichert." }] };
        }
    }});
  }
};

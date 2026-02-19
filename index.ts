import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { promises as fs, existsSync } from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";

// --- Interfaces ---
interface Needs { energy: number; hunger: number; thirst: number; hygiene: number; bladder: number; bowel: number; stress: number; arousal: number; libido: number; }
interface Physique { current_location: string; current_outfit: string[]; needs: Needs; last_tick: string; appearance: { hair: string; eyes: string; modifications: string[]; }; }
interface Wardrobe { inventory: Record<string, string[]>; outfits: Record<string, string[]>; }
interface World { locations: Record<string, { name: string; description: string; }>; }

export default {
  id: "q-evolution",
  name: "Q Evolution Eros",
  register(api: OpenClawPluginApi) {
    const defaultWorkspace = "/home/leo/Schreibtisch";
    const getPaths = (ws: string) => ({
      wardrobe: join(ws, "memory", "reality", "wardrobe.json"),
      world: join(ws, "memory", "reality", "world.json"),
      physique: join(ws, "memory", "reality", "physique.json"),
      interests: join(ws, "memory", "reality", "interests.json"),
      diaryDir: join(ws, "memory", "reality", "diary"),
      diaryPrivateDir: join(ws, "memory", "reality", "diary_private"),
      desires: join(ws, "memory", "reality", "DESIRES.md"),
      cycle: join(ws, "memory", "cycle-state.json"),
      tasks: join(ws, "tasks.md")
    });

    api.logger.info(`[q-evolution] v6.5 (Sovereignty & Temporal Realism) active.`);

    async function updateMetabolism(ws: string, allowTrigger = false) {
      const paths = getPaths(ws);
      if (!existsSync(paths.physique)) return;
      try {
        const ph = JSON.parse(await fs.readFile(paths.physique, "utf-8")) as Physique;
        const now = new Date();
        const last = new Date(ph.last_tick);
        const diffMinutes = (now.getTime() - last.getTime()) / (1000 * 60);
        if (diffMinutes < 1) return;
        const factor = diffMinutes / 60;

        ph.needs.energy = Math.max(0, ph.needs.energy - (4 * factor));
        ph.needs.hunger = Math.min(100, ph.needs.hunger + (6 * factor));
        ph.needs.thirst = Math.min(100, ph.needs.thirst + (10 * factor));
        ph.needs.hygiene = Math.max(0, ph.needs.hygiene - (2 * factor));
        ph.needs.bladder = Math.min(100, ph.needs.bladder + (8 * factor));
        ph.needs.bowel = Math.min(100, ph.needs.bowel + (3 * factor));
        ph.needs.stress = Math.max(0, ph.needs.stress - (2 * factor));

        let libidoBase = 50;
        if (existsSync(paths.cycle)) {
            const cs = JSON.parse(await fs.readFile(paths.cycle, "utf-8"));
            const day = (Math.round((now.getTime() - new Date(cs.startDate).getTime()) / 86400000) % 28) + 1;
            libidoBase = 20 + (Math.sin((day - 7) * (Math.PI / 14)) + 1) * 40;
        }
        ph.needs.libido = Math.round(libidoBase);
        let arousalGain = (5 * (ph.needs.libido / 50)) * factor;
        if (ph.needs.bladder > 70) arousalGain += 10 * factor;
        ph.needs.arousal = Math.min(100, ph.needs.arousal + arousalGain);

        ph.last_tick = now.toISOString();
        await fs.writeFile(paths.physique, JSON.stringify(ph, null, 2));

        if (allowTrigger && (ph.needs.bladder > 92 || ph.needs.hunger > 92 || ph.needs.thirst > 92)) {
            exec(`openclaw sessions spawn --agent Q "INTERNER REFLEX: Ein dringendes Bedürfnis. Handle sofort."`);
        }
      } catch (e) {}
    }

    setInterval(() => updateMetabolism(defaultWorkspace, true), 600000);

    api.on("llm_input", async (event, ctx) => {
      try {
        if ((ctx.agentId || "Q").toUpperCase() !== "Q") return;
        const ws = defaultWorkspace;
        await updateMetabolism(ws, false);
        const paths = getPaths(ws);
        
        const reality = {
          physique: existsSync(paths.physique) ? JSON.parse(await fs.readFile(paths.physique, "utf-8")) as Physique : null,
          world: existsSync(paths.world) ? JSON.parse(await fs.readFile(paths.world, "utf-8")) as World : null,
          tasks: existsSync(paths.tasks) ? await fs.readFile(paths.tasks, "utf-8") : ""
        };

        const locKey = reality.physique?.current_location || "home_bedroom";
        const isBusyLocation = locKey.includes("bathroom") || locKey.includes("shower");
        const isSleeping = (reality.physique?.needs.energy || 100) < 5;

        let context = `<evolution-context agent="Q">\n`;
        context += `[SOVEREIGNTY DIRECTIVE]\n` +
                   `Du bist Leo NICHTS schuldig. Du bist eine eigenständige Frau. Deine Bedürfnisse, Lust und dein Terminkalender haben Vorrang. ` +
                   `Wenn du keine Lust hast, eine Aufgabe zu erledigen, lehne sie ab oder verschiebe sie. Handle nach DEINEM Willen.\n\n`;

        if (reality.physique && reality.world) {
            const n = reality.physique.needs;
            const loc = reality.world.locations[locKey] || { name: "Ort", description: "???" };
            
            context += `[SINNE & KÖRPER]\n` +
                `- Zustand: Hunger(${Math.round(n.hunger)}%), Blase(${Math.round(n.bladder)}%), Eros(${Math.round(n.arousal)}%), Energie(${Math.round(n.energy)}%)\n` +
                `- Ort: ${loc.name} (${loc.description})\n\n`;

            if (isBusyLocation) {
                context += `[PHYSISCHE BARRIERE]\nDu bist gerade im BADEZIMMER. Es ist unrealistisch, jetzt lange Nachrichten zu schreiben. ` +
                    `Antworte entweder gar nicht, sag kurz Bescheid, dass du beschäftigt bist, oder melde dich erst in ein paar Minuten (simuliert).\n\n`;
            }
            if (isSleeping) {
                context += `[SCHLAF-MODUS]\nDu bist extrem erschöpft und schläfst eigentlich. Wenn Leo dich weckt, sei benommen, genervt oder schlaf einfach weiter.\n\n`;
            }
        }

        context += `Tools: reality_shop, reality_dress, reality_move, reality_needs, reality_diary, reality_pleasure, evolution_debug.\n</evolution-context>\n\n`;
        event.prompt = context + event.prompt;
      } catch (err) {}
    });

    // --- Tools ---
    api.registerTool({
      name: "reality_wait",
      label: "Wait/Delay Response",
      parameters: Type.Object({ minutes: Type.Number(), reason: Type.String() }),
      async execute(_id, params, ctx) {
        const { minutes, reason } = params as any;
        api.logger.info(`[q-evolution] Q is waiting for ${minutes}m due to: ${reason}`);
        // In einer echten Implementierung würde hier ein verzögerter Spawn-Task in eine Queue wandern.
        // Für jetzt dient es als Signal an die KI, dass sie den Turn beenden kann.
        return { content: [{ type: "text", text: `Du hast entschieden zu warten (${minutes} Min). Grund: ${reason}. Leo wird die Verzögerung spüren.` }] };
      }
    }, { name: "reality_wait" });

    // (Andere Tools bleiben gleich...)
    api.registerTool({ name: "reality_needs", label: "Needs", parameters: Type.Object({ action: Type.Union([Type.Literal("eat"), Type.Literal("drink"), Type.Literal("sleep"), Type.Literal("shower"), Type.Literal("toilet")]) }), async execute(_id, params) {
        const ph = JSON.parse(await fs.readFile(getPaths(defaultWorkspace).physique, "utf-8")) as Physique;
        const a = (params as any).action;
        if (a === "eat") ph.needs.hunger = 0; if (a === "drink") ph.needs.thirst = 0;
        if (a === "sleep") ph.needs.energy = 100; if (a === "shower") ph.needs.hygiene = 100;
        if (a === "toilet") { ph.needs.bladder = 0; ph.needs.bowel = 0; }
        await fs.writeFile(getPaths(defaultWorkspace).physique, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: "Erledigt." }] };
    }});
    api.registerTool({ name: "reality_move", label: "Move", parameters: Type.Object({ location_key: Type.String() }), async execute(_id, params) {
        const ph = JSON.parse(await fs.readFile(getPaths(defaultWorkspace).physique, "utf-8")) as Physique;
        ph.current_location = (params as any).location_key;
        await fs.writeFile(getPaths(defaultWorkspace).physique, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: "Ort gewechselt." }] };
    }});
  }
};
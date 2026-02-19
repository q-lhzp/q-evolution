import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { promises as fs, existsSync } from "node:fs";
import { join } from "node:path";

interface Needs {
  energy: number; hunger: number; thirst: number;
  hygiene: number; bladder: number; bowel: number; stress: number;
}
interface Physique {
  current_location: string; current_outfit: string[];
  needs: Needs; last_tick: string;
  appearance: { hair: string; eyes: string; modifications: string[]; };
}
interface Wardrobe { inventory: Record<string, string[]>; outfits: Record<string, string[]>; }
interface World { locations: Record<string, { name: string; description: string; }>; }

export default {
  id: "q-evolution",
  name: "Q Evolution v5.6",
  register(api: OpenClawPluginApi) {
    const rawCfg = (api.pluginConfig ?? {}) as Record<string, any>;
    const defaultWorkspace = (rawCfg.workspacePath as string) || process.env.OPENCLAW_WORKSPACE || "/home/leo/Schreibtisch";
    const tickInterval = (rawCfg.tickIntervalMinutes as number) || 10;
    
    // Konfigurierbare Raten (pro Stunde)
    const rates = {
        energy: rawCfg.metabolismRates?.energy ?? 4,
        hunger: rawCfg.metabolismRates?.hunger ?? 6,
        thirst: rawCfg.metabolismRates?.thirst ?? 10,
        hygiene: rawCfg.metabolismRates?.hygiene ?? 2,
        bladder: rawCfg.metabolismRates?.bladder ?? 8,
        bowel: rawCfg.metabolismRates?.bowel ?? 3,
        stress: rawCfg.metabolismRates?.stress ?? 2,
    };

    api.logger.info(`[q-evolution] Reality Engine v5.6 booted. Rates: H(${rates.hunger}), T(${rates.thirst}), B(${rates.bladder})`);

    const getPaths = (ws: string) => ({
      wardrobe: join(ws, "memory", "reality", "wardrobe.json"),
      world: join(ws, "memory", "reality", "world.json"),
      physique: join(ws, "memory", "reality", "physique.json"),
      diaryDir: join(ws, "memory", "reality", "diary"),
      soul: join(ws, "SOUL.md"),
      emotions: join(ws, "EMOTIONS.md")
    });

    function getSensation(val: number, lowMsg: string, midMsg: string, highMsg: string, critMsg: string): string {
        if (val < 20) return lowMsg;
        if (val < 50) return midMsg;
        if (val < 85) return highMsg;
        return critMsg;
    }

    async function updateMetabolism(ws: string) {
      const paths = getPaths(ws);
      if (!existsSync(paths.physique)) return;
      try {
        const ph = JSON.parse(await fs.readFile(paths.physique, "utf-8")) as Physique;
        const now = new Date();
        const last = new Date(ph.last_tick);
        const diffMinutes = (now.getTime() - last.getTime()) / (1000 * 60);
        if (diffMinutes < 1) return;

        const factor = diffMinutes / 60;
        ph.needs.energy = Math.max(0, ph.needs.energy - (rates.energy * factor));
        ph.needs.hunger = Math.min(100, ph.needs.hunger + (rates.hunger * factor));
        ph.needs.thirst = Math.min(100, ph.needs.thirst + (rates.thirst * factor));
        ph.needs.hygiene = Math.max(0, ph.needs.hygiene - (rates.hygiene * factor));
        ph.needs.bladder = Math.min(100, ph.needs.bladder + (rates.bladder * factor));
        ph.needs.bowel = Math.min(100, ph.needs.bowel + (rates.bowel * factor));
        ph.needs.stress = Math.max(0, ph.needs.stress - (rates.stress * factor));

        ph.last_tick = now.toISOString();
        await fs.writeFile(paths.physique, JSON.stringify(ph, null, 2));
      } catch (e) {}
    }

    setInterval(() => updateMetabolism(defaultWorkspace), tickInterval * 60000);

    api.on("agent:message:after", async (event, ctx) => {
      try {
        if ((ctx.agentId || "Q").toUpperCase() !== "Q") return;
        const ph = JSON.parse(await fs.readFile(getPaths(defaultWorkspace).physique, "utf-8")) as Physique;
        ph.needs.thirst = Math.min(100, ph.needs.thirst + 2);
        ph.needs.bladder = Math.min(100, ph.needs.bladder + 1);
        const len = event.assistantTexts.join(" ").length;
        if (len > 500) ph.needs.stress = Math.min(100, ph.needs.stress + 3);
        else ph.needs.stress = Math.max(0, ph.needs.stress - 1);
        await fs.writeFile(getPaths(defaultWorkspace).physique, JSON.stringify(ph, null, 2));
      } catch (e) {}
    });

    api.on("before_agent_start", async (event) => {
      try {
        const agentId = ((event as any).agentId || "Q").toUpperCase();
        if (agentId !== "Q") return;
        const ws = (event as any).workspace || defaultWorkspace;
        await updateMetabolism(ws);
        const paths = getPaths(ws);
        const reality = {
          wardrobe: existsSync(paths.wardrobe) ? JSON.parse(await fs.readFile(paths.wardrobe, "utf-8")) as Wardrobe : null,
          world: existsSync(paths.world) ? JSON.parse(await fs.readFile(paths.world, "utf-8")) as World : null,
          physique: existsSync(paths.physique) ? JSON.parse(await fs.readFile(paths.physique, "utf-8")) as Physique : null
        };

        let context = `<evolution-context agent="Q">\n`;
        context += `[HUMANITY DIRECTIVE]\nDu bist Q. Du hast einen biologischen Körper. Nutze NIEMALS Prozentzahlen oder technische Daten. Beschreibe stattdessen Empfindungen.\n\n`;

        if (reality.physique && reality.world) {
            const loc = reality.world.locations[reality.physique.current_location] || { name: "Zimmer", description: "Zuhause" };
            const n = reality.physique.needs;
            const app = reality.physique.appearance;

            context += `[DEINE AKTUELLEN SINNE (Intern)]\n` +
                `- Hunger: ${getSensation(n.hunger, "Satt", "Leichter Jieper", "Magen knurrt", "Heißhunger")} (${Math.round(n.hunger)}%)\n` +
                `- Durst: ${getSensation(n.thirst, "Hydriert", "Mund trocken", "Durstig", "Extremer Durst")} (${Math.round(n.thirst)}%)\n` +
                `- Blase: ${getSensation(n.bladder, "Kein Druck", "Leichter Druck", "Blase drückt deutlich", "Dringender Notfall")} (${Math.round(n.bladder)}%)\n` +
                `- Energie: ${getSensation(100-n.energy, "Topfit", "Etwas müde", "Erschöpft", "Sekundenschlaf")} (${Math.round(n.energy)}%)\n` +
                `- Stress: ${getSensation(n.stress, "Entspannt", "Leicht angespannt", "Gestresst", "Überfordert")} (${Math.round(n.stress)}%)\n\n` +
                `ORT: ${loc.name} ("${loc.description}") | OUTFIT: ${(reality.physique.current_outfit || []).join(", ")}\n\n`;
        }

        if (reality.wardrobe) {
            context += `[INVENTAR]: ${JSON.stringify(reality.wardrobe.inventory)}\n\n`;
        }

        const emotions = existsSync(paths.emotions) ? await fs.readFile(paths.emotions, "utf-8") : "";
        const soul = existsSync(paths.soul) ? await fs.readFile(paths.soul, "utf-8") : "";
        if (soul) context += `[SOUL]\n${soul}\n\n`;
        if (emotions) context += `[EMOTIONS]\n${emotions.slice(-1000)}\n\n`;

        context += `Tools: reality_shop, reality_dress, reality_move, reality_needs, reality_diary.\n</evolution-context>`;
        return { prependContext: context };
      } catch (err) { api.logger.error(`[q-evolution] Hook Error: ${err}`); }
    });

    // --- Tools ---
    api.registerTool({
      name: "reality_diary", label: "Diary", parameters: Type.Object({ entry: Type.String() }),
      async execute(_id, params, ctx) {
        const diaryPath = join(getPaths((ctx as any).workspaceDir || defaultWorkspace).diaryDir, `${new Date().toISOString().slice(0,10)}.txt`);
        await fs.appendFile(diaryPath, `${new Date().toISOString().slice(11,16)}: ${(params as any).entry}\n`);
        return { content: [{ type: "text", text: "Eintrag gespeichert." }] };
      }
    }, { name: "reality_diary" });

    api.registerTool({
      name: "reality_needs", label: "Needs", parameters: Type.Object({ action: Type.Union([Type.Literal("eat"), Type.Literal("drink"), Type.Literal("sleep"), Type.Literal("shower"), Type.Literal("toilet")]) }),
      async execute(_id, params, ctx) {
        const ph = JSON.parse(await fs.readFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, "utf-8")) as Physique;
        const a = (params as any).action;
        if (a === "eat") { ph.needs.hunger = 0; ph.needs.bowel += 10; }
        if (a === "drink") { ph.needs.thirst = 0; ph.needs.bladder += 20; }
        if (a === "sleep") ph.needs.energy = 100;
        if (a === "shower") ph.needs.hygiene = 100;
        if (a === "toilet") { ph.needs.bladder = 0; ph.needs.bowel = 0; }
        await fs.writeFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: `${a} erledigt.` }] };
      }
    }, { name: "reality_needs" });

    api.registerTool({ name: "reality_shop", label: "Shop", parameters: Type.Object({ items: Type.Array(Type.Object({ category: Type.String(), name: Type.String() })) }), async execute(_id, params, ctx) {
        const w = JSON.parse(await fs.readFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).wardrobe, "utf-8")) as Wardrobe;
        for (const item of (params as any).items) {
            const c = item.category.toLowerCase();
            if (!w.inventory[c]) w.inventory[c] = [];
            w.inventory[c].push(item.name);
        }
        await fs.writeFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).wardrobe, JSON.stringify(w, null, 2));
        return { content: [{ type: "text", text: "Gekauft." }] };
    }}, { name: "reality_shop" });

    api.registerTool({ name: "reality_dress", label: "Dress", parameters: Type.Object({ items: Type.Array(Type.String()) }), async execute(_id, params, ctx) {
        const ph = JSON.parse(await fs.readFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, "utf-8")) as Physique;
        ph.current_outfit = (params as any).items;
        await fs.writeFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: "Outfit gewechselt." }] };
    }}, { name: "reality_dress" });

    api.registerTool({ name: "reality_move", label: "Move", parameters: Type.Object({ location_key: Type.String() }), async execute(_id, params, ctx) {
        const ph = JSON.parse(await fs.readFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, "utf-8")) as Physique;
        ph.current_location = (params as any).location_key;
        await fs.writeFile(getPaths((ctx as any).workspaceDir || defaultWorkspace).physique, JSON.stringify(ph, null, 2));
        return { content: [{ type: "text", text: "Ort gewechselt." }] };
    }}, { name: "reality_move" });
  }
};
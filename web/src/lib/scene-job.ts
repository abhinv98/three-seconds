import type Anthropic from "@anthropic-ai/sdk";
import type { BrandKitData } from "@/lib/brand-kit";
import { askForJson, CHEAP_MODEL } from "@/lib/claude";
import { worker } from "@/lib/finer";
import { jobStore } from "@/lib/jobs";
import { buildSceneData, type SceneData, type WorkerScene } from "@/lib/scene";

// SAM 3.1 over the whole Reel for the Studio, started beside the finer read. All of it has to fit that read's 300 s
// function: 30 s at most for the phrase, 250 s for the worker, and building the data took 3 s on a 50 s Reel.

export const reelScenes = jobStore<SceneData>("reel_scene", "reel_id", "scene");

const PHRASE_TIMEOUT_MS = 30_000;
const WORKER_TIMEOUT_MS = 250_000;
const SAM_FPS = 15;
const FALLBACK_PHRASE = "product";

/** SAM takes a short visual noun: lower case, at most 3 words, nothing else. */
export function cleanPhrase(raw: unknown): string {
  const words = String(raw ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return words.join(" ") || FALLBACK_PHRASE;
}

const PHRASE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["product"],
  properties: { product: { type: "string", description: "1 to 3 word noun for the physical product on screen" } },
};

/** What to tell SAM to look for. A failed or slow pick falls back to the plain word, which SAM can still try. */
async function pickProductPhrase(videoUrl: string, durationS: number, kit: BrandKitData): Promise<{ product: string; costUsd: number }> {
  const pick = async () => {
    const { frames } = await worker<{ frames: { t: number; jpeg: string }[] }>("/frames", {
      blob_url: videoUrl,
      fps: Math.min(2, 3 / Math.max(durationS, 1)),
      width: 360,
    });
    const content: Anthropic.Beta.BetaContentBlockParam[] = frames.slice(0, 3).map((f) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.jpeg },
    }));
    content.push({
      type: "text",
      text: `These are frames from a creator's Reel for ${kit.name}. Its products: ${kit.products.join(", ") || "not listed"}. Name the physical product on screen as a plain 1 to 3 word noun that describes how it looks, for an object tracker: "sunglasses", not a brand or model name.`,
    });
    const { data, costUsd } = await askForJson<{ product: string }>({ content, schema: PHRASE_SCHEMA, effort: "low", model: CHEAP_MODEL });
    return { product: cleanPhrase(data.product), costUsd };
  };
  const tooSlow = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The phrase pick took too long.")), PHRASE_TIMEOUT_MS));
  try {
    return await Promise.race([pick(), tooSlow]);
  } catch {
    return { product: FALLBACK_PHRASE, costUsd: 0 };
  }
}

/** Never throws, a failure is saved on the row instead. Claim the row first. */
export async function buildScene(reel: { id: string; video_url: string; duration_s: number }, kit: BrandKitData) {
  try {
    const { product, costUsd } = await pickProductPhrase(reel.video_url, reel.duration_s, kit);
    const raw = await worker<WorkerScene>(
      "/scene",
      {
        blob_url: reel.video_url,
        fps: SAM_FPS,
        width: 540,
        concepts: [
          { id: "person", phrase: "person", masks: true },
          { id: "face", phrase: "face", masks: false },
          { id: "hand", phrase: "hand", masks: false },
          { id: "product", phrase: product, masks: true },
          { id: "logo", phrase: "logo", masks: false },
        ],
      },
      WORKER_TIMEOUT_MS,
    );
    const scene = await buildSceneData(raw, { product, logo: "logo" }, costUsd);
    await reelScenes.finish(reel.id, scene, scene.cost_usd);
  } catch (error) {
    await reelScenes.fail(reel.id, error);
  }
}

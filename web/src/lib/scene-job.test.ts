import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandKitData } from "@/lib/brand-kit";
import type { SceneData, WorkerScene } from "@/lib/scene";

const worker = vi.fn();
const askForJson = vi.fn();
const store = { finish: vi.fn(async () => {}), fail: vi.fn(async () => {}) };

vi.mock("@/lib/finer", () => ({ worker }));
vi.mock("@/lib/claude", () => ({ askForJson, CHEAP_MODEL: "claude-haiku-5-5" }));
vi.mock("@/lib/jobs", () => ({ jobStore: () => store }));

const { buildScene, cleanPhrase } = await import("@/lib/scene-job");

const kit = { name: "Ray-Ban", products: ["Ray-Ban Meta Wayfarer"] } as BrandKitData;
const reel = { id: "r1", video_url: "https://blob.example/v.mp4", duration_s: 30 };
const answer: WorkerScene = {
  duration_s: 30,
  width: 540,
  height: 960,
  fps: 15,
  concepts: { person: { lines: [], error: null }, face: { lines: [], error: null }, hand: { lines: [], error: null }, product: { lines: [], error: null }, logo: { lines: [], error: null } },
  shots: [],
  waveform: [],
  sprite: { jpeg: "AAAA", cols: 1, rows: 1, tile_w: 90, tile_h: 160, every_s: 1 },
  cost_usd: 0.5,
};

beforeEach(() => {
  vi.clearAllMocks();
  worker.mockImplementation(async (path: string) => (path === "/frames" ? { frames: [1, 2, 3, 4].map((t) => ({ t, jpeg: `j${t}` })) } : answer));
  askForJson.mockResolvedValue({ data: { product: "Sunglasses!" }, costUsd: 0.001 });
});

describe("cleanPhrase", () => {
  it("leaves a short lower-case noun", () => {
    expect(cleanPhrase("Black Sunglasses.")).toBe("black sunglasses");
    expect(cleanPhrase("a very long product name indeed")).toBe("a very long");
    expect(cleanPhrase("<0f>1<|box|>")).toBe("0f 1 box");
    expect(cleanPhrase("")).toBe("product");
    expect(cleanPhrase(null)).toBe("product");
  });
});

describe("buildScene", () => {
  it("picks the phrase with Haiku from 3 frames, runs the concepts and saves the scene", async () => {
    await buildScene(reel, kit);
    const [picked] = askForJson.mock.calls[0];
    expect(picked.model).toBe("claude-haiku-5-5");
    expect(picked.content.filter((b: { type: string }) => b.type === "image")).toHaveLength(3);
    expect(picked.content.at(-1).text).toContain("Ray-Ban Meta Wayfarer");
    expect(worker.mock.calls[0][1]).toMatchObject({ blob_url: reel.video_url, fps: 0.1 });
    const [path, body] = worker.mock.calls[1];
    expect(path).toBe("/scene");
    expect(body.concepts).toEqual([
      { id: "person", phrase: "person", masks: true },
      { id: "face", phrase: "face", masks: false },
      { id: "hand", phrase: "hand", masks: false },
      { id: "product", phrase: "sunglasses", masks: true },
      { id: "logo", phrase: "logo", masks: false },
    ]);
    const [id, scene, cost] = (store.finish.mock.calls as unknown as [string, SceneData, number][])[0];
    expect(id).toBe("r1");
    expect(scene.phrases).toEqual({ product: "sunglasses", logo: "logo" });
    expect(scene.cost_usd).toBeCloseTo(0.501);
    expect(cost).toBeCloseTo(0.501);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("still tracks when the phrase pick fails", async () => {
    askForJson.mockRejectedValue(new Error("no"));
    await buildScene(reel, kit);
    expect(worker.mock.calls[1][1].concepts[3].phrase).toBe("product");
    expect(store.finish).toHaveBeenCalled();
  });

  it("doesn't wait long for the phrase", async () => {
    vi.useFakeTimers();
    askForJson.mockReturnValue(new Promise(() => {}));
    const done = buildScene(reel, kit);
    await vi.advanceTimersByTimeAsync(30_000);
    await done;
    vi.useRealTimers();
    expect(worker.mock.calls[1][1].concepts[3].phrase).toBe("product");
    expect(store.finish).toHaveBeenCalled();
  });

  it("asks for at most 2 frames a second on a very short Reel", async () => {
    await buildScene({ ...reel, duration_s: 0.5 }, kit);
    expect(worker.mock.calls[0][1].fps).toBe(2);
  });

  it("saves a failure on the row instead of throwing", async () => {
    worker.mockImplementation(async (path: string) => {
      if (path === "/frames") return { frames: [] };
      throw new Error("The analysis worker answered HTTP 500.");
    });
    await expect(buildScene(reel, kit)).resolves.toBeUndefined();
    expect(store.fail).toHaveBeenCalledWith("r1", expect.objectContaining({ message: "The analysis worker answered HTTP 500." }));
    expect(store.finish).not.toHaveBeenCalled();
  });
});

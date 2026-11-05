import { describe, expect, it } from "vitest";
import { encodeSegmentationMask } from "../../node_modules/@meta-sam/parser/dist/mask-codec.js";
import { buildSceneData, collidesWithUi, type SceneData, type WorkerScene } from "@/lib/scene";

const W = 540;
const H = 960;
const FPS = 15;

type Rect = [x0: number, y0: number, x1: number, y1: number];
type Px = { left: number; top: number; right: number; bottom: number };

const boundsOf = (rects: Rect[]): Px => ({
  left: Math.min(...rects.map((r) => r[0])),
  top: Math.min(...rects.map((r) => r[1])),
  right: Math.max(...rects.map((r) => r[2])),
  bottom: Math.max(...rects.map((r) => r[3])),
});

/** A SAM record on the wire: box corners inclusive, the mask raster on the box, possibly at another size. */
function record(id: number | string, rects: Rect[], { mask = true, scale = 1, c = 0.9, on }: { mask?: boolean; scale?: number; c?: number; on?: Px } = {}) {
  const b = on ?? boundsOf(rects);
  const box = `<|box;x1=${b.left};y1=${b.top};x2=${b.right - 1};y2=${b.bottom - 1};w=${W};h=${H};c=${c}|>`;
  if (!mask) return `${id}${box}`;
  const w = Math.round((b.right - b.left) * scale);
  const h = Math.round((b.bottom - b.top) * scale);
  const raster = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = Math.floor((y0 - b.top) * scale); y < Math.ceil((y1 - b.top) * scale); y++) {
      for (let x = Math.floor((x0 - b.left) * scale); x < Math.ceil((x1 - b.left) * scale); x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) raster[y * w + x] = 1;
      }
    }
  }
  return `${id}${box}<|mask;x=0;y=0;c=${c};data=${h},${w},${encodeSegmentationMask(raster, w, h).payload}|>`;
}

const line = (frame: number, ...records: string[]) => `<${frame}f>${records.join(",")}`;
const boxRect = (x: number, y: number, w: number, h: number): Rect => [x, y, x + w, y + h];
const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);

/** A standing person centred on cx: head, neck, torso, two legs. */
const standing = (cx = 270, dy = 0): Rect[] => [
  [cx - 40, 200 + dy, cx + 40, 300 + dy],
  [cx - 15, 300 + dy, cx + 15, 330 + dy],
  [cx - 80, 330 + dy, cx + 80, 620 + dy],
  [cx - 70, 620 + dy, cx - 10, 900 + dy],
  [cx + 10, 620 + dy, cx + 70, 900 + dy],
];
const faceBox = (cx = 270, dy = 0): Rect => [cx - 35, 205 + dy, cx + 35, 295 + dy];

function raw(concepts: Partial<Record<"person" | "face" | "hand" | "product" | "logo", string[]>>, over: Partial<WorkerScene> = {}): WorkerScene {
  const lines = (id: keyof typeof concepts) => ({ lines: concepts[id] ?? [], error: null });
  return {
    duration_s: 10,
    width: W,
    height: H,
    fps: FPS,
    concepts: { person: lines("person"), face: lines("face"), hand: lines("hand"), product: lines("product"), logo: lines("logo") },
    shots: [],
    waveform: [0, 128, 255],
    sprite: { jpeg: "AAAA", cols: 10, rows: 1, tile_w: 90, tile_h: 160, every_s: 1 },
    cost_usd: 0.5,
    ...over,
  };
}

const build = (concepts: Parameters<typeof raw>[0], over?: Partial<WorkerScene>) => buildSceneData(raw(concepts, over), { product: "sunglasses", logo: "logo" });

async function oneFrame(rects: Rect[], { face, hands = [], scale }: { face?: Rect; hands?: Rect[]; scale?: number } = {}) {
  const scene = await build({
    person: [line(0, record(0, rects, { scale }))],
    face: face ? [line(0, record(0, [face], { mask: false }))] : [],
    hand: hands.length ? [line(0, ...hands.map((h, i) => record(i, [h], { mask: false })))] : [],
  });
  return scene.body[0];
}

const spineXs = (spine: number[]) => spine.filter((_, i) => i % 2 === 0);

describe("outline", () => {
  const armOut: Rect[] = [...standing(), [350, 340, 520, 390]];

  it("always has 48 points, in fractions", async () => {
    for (const rects of [standing(), armOut, [boxRect(10, 10, 3, 3)], [boxRect(300, 400, 1, 1)]]) {
      const { outline } = await oneFrame(rects);
      expect(outline).toHaveLength(96);
      expect(outline.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    }
  });

  it("starts at the top point, in the middle of a flat top", async () => {
    const { outline } = await oneFrame(armOut);
    const ys = outline.filter((_, i) => i % 2 === 1);
    expect(outline[1]).toBe(Math.min(...ys));
    expect(outline[0] * W).toBeCloseTo(270, -1);
  });

  it("runs clockwise on screen", async () => {
    const { outline } = await oneFrame(armOut);
    let doubled = 0;
    for (let i = 0; i < 48; i++) {
      const j = (i + 1) % 48;
      doubled += outline[i * 2] * outline[j * 2 + 1] - outline[j * 2] * outline[i * 2 + 1];
    }
    expect(doubled).toBeGreaterThan(0);
  });

  it("makes one lap: neighbouring points stay close, whatever the shape", async () => {
    const { outline } = await oneFrame(armOut);
    for (let i = 0; i < 48; i++) {
      const j = (i + 1) % 48;
      expect(Math.hypot(outline[i * 2] - outline[j * 2], outline[i * 2 + 1] - outline[j * 2 + 1])).toBeLessThan(0.2);
    }
  });

  it("reaches the arm and ignores a stray blob", async () => {
    const { outline } = await oneFrame([...armOut, boxRect(20, 20, 8, 8)]);
    const xs = outline.filter((_, i) => i % 2 === 0);
    const ys = outline.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs) * W).toBeGreaterThan(480);
    expect(Math.min(...xs) * W).toBeGreaterThan(100);
    expect(Math.min(...ys) * H).toBeGreaterThan(150);
  });

  it("scales a raster that isn't the size of its box", async () => {
    const full = await oneFrame(armOut);
    const half = await oneFrame(armOut, { scale: 0.5 });
    const box = (o: number[], k: number) => [Math.min(...o.filter((_, i) => i % 2 === k)), Math.max(...o.filter((_, i) => i % 2 === k))];
    for (const k of [0, 1]) {
      expect(box(half.outline, k)[0]).toBeCloseTo(box(full.outline, k)[0], 1);
      expect(box(half.outline, k)[1]).toBeCloseTo(box(full.outline, k)[1], 1);
    }
    expect(half.share).toBeCloseTo(full.share, 2);
  });

  it("measures the mask's share and the box", async () => {
    const body = await oneFrame([boxRect(100, 100, 108, 192)]);
    expect(body.share).toBeCloseTo(0.04, 3);
    expect(body.box).toEqual([0.1852, 0.1042, 0.2, 0.2]);
  });
});

describe("spine", () => {
  it("has 12 points from the crown to the bottom of the mask", async () => {
    const { spine } = await oneFrame(standing(), { face: faceBox() });
    expect(spine).toHaveLength(24);
    expect(spine![0] * W).toBeCloseTo(270, 0);
    expect(spine![1] * H).toBeCloseTo(205, 0);
    expect(spine![23] * H).toBeGreaterThan(880);
    const ys = spine!.filter((_, i) => i % 2 === 1);
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1])).toBe(true);
  });

  it("is null with no face on the body: a POV arm, a person seen from behind", async () => {
    const arm: Rect[] = [[300, 600, 540, 800], [250, 780, 400, 960]];
    expect((await oneFrame(arm)).spine).toBeNull();
    expect((await oneFrame(standing())).spine).toBeNull();
  });

  it("is null when the face box overlaps the body's box but not its mask", async () => {
    const lShape: Rect[] = [[300, 200, 340, 800], [100, 760, 340, 800]];
    expect((await oneFrame(lShape, { face: [120, 300, 200, 420] })).spine).toBeNull();
  });

  it("is null when there is no body below the face", async () => {
    expect((await oneFrame([[200, 200, 340, 300]], { face: [205, 205, 335, 299] })).spine).toBeNull();
  });

  it("goes straight down the middle of a symmetric body", async () => {
    const { spine } = await oneFrame(standing(), { face: faceBox() });
    for (const x of spineXs(spine!)) expect(Math.abs(x * W - 270)).toBeLessThan(1);
  });

  it("isn't dragged by an arm held out", async () => {
    const still = (await oneFrame(standing(), { face: faceBox() })).spine!;
    for (const arm of [[350, 340, 530, 390], [350, 500, 530, 550]] as Rect[]) {
      const { spine } = await oneFrame([...standing(), arm], { face: faceBox() });
      spineXs(spine!).forEach((x, i) => expect(Math.abs(x - spineXs(still)[i])).toBeLessThan(0.03));
    }
  });

  it("isn't dragged by a hand across the body, or by a hand reaching out of it", async () => {
    const still = (await oneFrame(standing(), { face: faceBox() })).spine!;
    const across = await oneFrame(standing(), { face: faceBox(), hands: [[230, 420, 330, 500]] });
    spineXs(across.spine!).forEach((x, i) => expect(Math.abs(x - spineXs(still)[i])).toBeLessThan(0.02));
    const reaching = await oneFrame([...standing(), [340, 420, 420, 500]], { face: faceBox(), hands: [[340, 420, 420, 500]] });
    spineXs(reaching.spine!).forEach((x, i) => expect(Math.abs(x - spineXs(still)[i])).toBeLessThan(0.02));
  });

  it("stays between the legs where the mask splits", async () => {
    const { spine } = await oneFrame(standing(), { face: faceBox() });
    expect(Math.abs(spine![22] * W - 270)).toBeLessThan(5);
  });

  it("never moves sideways faster than 0.6 of its way down", async () => {
    const leaning: Rect[] = [[230, 200, 310, 300], ...range(0, 12).map((i): Rect => [190 + i * 30, 300 + i * 50, 350 + i * 30, 350 + i * 50])];
    const { spine } = await oneFrame(leaning, { face: faceBox() });
    const below = spine!.map((v, i) => (i % 2 ? v * H : v * W));
    for (let i = 2; i < 12; i++) {
      const dx = Math.abs(below[i * 2] - below[(i - 1) * 2]);
      const dy = Math.abs(below[i * 2 + 1] - below[(i - 1) * 2 + 1]);
      expect(dx).toBeLessThanOrEqual(0.61 * Math.hypot(dx, dy) + 1);
    }
  });

  const moving = (frames: number[], at: (f: number) => number) => ({
    person: frames.map((f) => line(f, record(0, standing(at(f))))),
    face: frames.map((f) => line(f, record(0, [faceBox(at(f))], { mask: false }))),
  });
  const crownX = (scene: SceneData, frame: number) => scene.body.find((b) => b.t === Math.round((frame / FPS) * 1000) / 1000)!.spine![0] * W;

  it("smooths a one-frame jump over 5 frames", async () => {
    const scene = await build(moving(range(0, 12), (f) => (f === 5 ? 330 : 270)));
    expect(crownX(scene, 4)).toBeCloseTo(270 + 60 / 5, 0);
    expect(crownX(scene, 6)).toBeCloseTo(270 + 60 / 5, 0);
    expect(crownX(scene, 0)).toBeCloseTo(270, 0);
  });

  it("doesn't smooth across a shot cut", async () => {
    const scene = await build(moving(range(0, 12), (f) => (f < 6 ? 200 : 350)), { shots: [6 / FPS] });
    expect(crownX(scene, 4)).toBeCloseTo(200, 0);
    expect(crownX(scene, 6)).toBeCloseTo(350, 0);
  });

  it("doesn't smooth across a gap over 2 frames, and does across a shorter one", async () => {
    const long = await build(moving([...range(0, 5), ...range(8, 14)], (f) => (f < 6 ? 200 : 350)));
    expect(crownX(long, 4)).toBeCloseTo(200, 0);
    const short = await build(moving([...range(0, 5), ...range(7, 14)], (f) => (f < 6 ? 200 : 350)));
    expect(crownX(short, 4)).toBeGreaterThan(205);
  });
});

describe("the primary body", () => {
  it("is the person holding the face, even if someone else is larger", async () => {
    const scene = await build({
      person: [line(0, record(0, [boxRect(0, 100, 300, 860)]), record(1, standing(400)))],
      face: [line(0, record(0, [faceBox(400)], { mask: false }))],
    });
    expect(scene.body[0].box[0] * W).toBeGreaterThan(300);
    expect(scene.body[0].spine).not.toBeNull();
  });

  it("is the largest person when nobody holds a face", async () => {
    const scene = await build({ person: [line(0, record(0, [boxRect(0, 0, 100, 100)]), record(1, [boxRect(200, 200, 300, 600)]))] });
    expect(scene.body[0].share).toBeCloseTo((300 * 600) / (W * H), 3);
  });

  it("stays with the same body from frame to frame", async () => {
    const small = record(0, [boxRect(10, 100, 100, 200)]);
    const scene = await build({
      person: [line(0, small), line(2, small, record(1, [boxRect(200, 100, 300, 800)]))],
    });
    expect(scene.body.map((b) => b.share)).toEqual([scene.body[0].share, scene.body[0].share]);
  });

  it("keeps every second frame, also when only odd frames are left", async () => {
    const person = range(0, 10).map((f) => line(f, record(0, standing())));
    expect((await build({ person })).body.map((b) => b.t)).toEqual([0, 2 / FPS, 4 / FPS, 6 / FPS, 8 / FPS].map((t) => Math.round(t * 1000) / 1000));
    const thinned = await build({ person: [1, 3, 5, 7].map((f) => line(f, record(0, standing()))) }, { thinned: { person: 2 } });
    expect(thinned.body).toHaveLength(4);
    expect(thinned.lanes.hand).toEqual([]);
  });
});

const boxes = (frames: number[], rect: Rect, id = 0) => frames.map((f) => line(f, record(id, [rect], { mask: false })));

describe("lanes", () => {
  it("fills gaps of up to 3 frames and no longer ones", async () => {
    const scene = await build({ hand: boxes([...range(0, 10), ...range(13, 20), ...range(24, 30)], boxRect(10, 400, 50, 50)) });
    expect(scene.lanes.hand).toEqual([
      { t_start: 0, t_end: 1.333 },
      { t_start: 1.6, t_end: 2 },
    ]);
  });

  it("marks the logo missing where nothing shows for over 2 s, at the start and end too", async () => {
    const scene = await build({ logo: boxes([...range(45, 60), ...range(75, 120)], boxRect(10, 200, 60, 30)) }, { duration_s: 12 });
    expect(scene.lanes.logo).toEqual([
      { t_start: 3, t_end: 4 },
      { t_start: 5, t_end: 8 },
    ]);
    expect(scene.lanes.logoMissing).toEqual([
      { t_start: 0, t_end: 3 },
      { t_start: 8, t_end: 12 },
    ]);
  });

  it("marks the whole Reel when the logo never shows", async () => {
    expect((await build({})).lanes.logoMissing).toEqual([{ t_start: 0, t_end: 10 }]);
  });

  it("doesn't claim the logo is missing when SAM couldn't look for it", async () => {
    const failing = raw({ person: [line(0, record(0, standing()))] });
    failing.concepts.logo = { lines: [], error: "SAM 3.1 could not finish this concept." };
    const scene = await buildSceneData(failing, { product: "x", logo: "logo" });
    expect(scene.failed).toEqual(["logo"]);
    expect(scene.lanes.logoMissing).toEqual([]);
  });

  it("marks the product in hand only when a hand overlaps it by a real amount", async () => {
    const product = boxes(range(0, 30), boxRect(200, 500, 100, 60));
    const holding = await build({ product, hand: boxes(range(10, 20), boxRect(250, 500, 80, 100)) });
    expect(holding.lanes.productInHand).toEqual([{ t_start: 0.667, t_end: 1.333 }]);
    const brushing = await build({ product, hand: boxes(range(10, 20), boxRect(295, 500, 80, 100)) });
    expect(brushing.lanes.productInHand).toEqual([]);
    const apart = await build({ product, hand: boxes(range(10, 20), boxRect(0, 0, 50, 50)) });
    expect(apart.lanes.productInHand).toEqual([]);
  });

  it("counts a POV arm as a body but not as the creator", async () => {
    const face = boxes(range(0, 20), faceBox());
    const person = [...range(0, 20).map((f) => line(f, record(0, standing()))), ...range(20, 40).map((f) => line(f, record(0, [[300, 600, 540, 900]])))];
    const scene = await build({ person, face }, { shots: [20 / FPS] });
    expect(scene.body.length).toBeGreaterThan(15);
    expect(scene.lanes.creator).toEqual([{ t_start: 0, t_end: 1.333 }]);
  });

  it("keeps the creator on camera for a moment the face is lost in the same shot", async () => {
    const person = range(0, 40).map((f) => line(f, record(0, standing())));
    const scene = await build({ person, face: boxes(range(0, 10), faceBox()) });
    expect(scene.lanes.creator).toEqual([{ t_start: 0, t_end: 2.667 }]);
    expect(scene.body.filter((b) => b.spine).length).toBeLessThan(scene.body.length);
  });

  it("drops a product that is only a picture inside the logo, and keeps a logo printed on a product", async () => {
    const icon = boxRect(100, 140, 40, 18);
    const logoTag = boxRect(95, 135, 200, 30);
    const icons = await build({ product: boxes(range(0, 30), icon), logo: boxes(range(0, 30), logoTag) });
    expect(icons.lanes.product).toEqual([]);
    expect(icons.tracks.product).toEqual([]);
    expect(icons.stats.productFirstSeen).toBeNull();
    const bottle = await build({ product: boxes(range(0, 30), boxRect(200, 300, 120, 400)), logo: boxes(range(0, 30), boxRect(230, 400, 60, 40)) });
    expect(bottle.lanes.product).toEqual([{ t_start: 0, t_end: 2 }]);
  });

  it("follows one product and one face per frame, and every hand", async () => {
    const product = range(0, 6).map((f) => line(f, record(5, [boxRect(100, 300, 50, 50)], { mask: false, c: 0.5 }), record(6, [boxRect(300, 300, 50, 50)], { mask: false, c: 0.9 })));
    const hand = range(0, 6).map((f) => line(f, record(0, [boxRect(10, 700, 50, 50)], { mask: false }), record(1, [boxRect(400, 700, 50, 50)], { mask: false })));
    const scene = await build({ product, hand });
    expect(scene.tracks.product).toHaveLength(6);
    expect(new Set(scene.tracks.product.map((f) => f.box[0]))).toEqual(new Set([Math.round((300 / W) * 10000) / 10000]));
    expect(scene.tracks.hand).toHaveLength(12);
    expect(scene.tracks.hand[0].c).toBe(0.9);
  });
});

describe("stats", () => {
  it("reads the hook, first seen and shares from the lanes", async () => {
    const scene = await build({
      person: range(0, 30).map((f) => line(f, record(0, standing()))),
      face: boxes(range(0, 30), faceBox()),
      product: boxes(range(30, 90), boxRect(200, 400, 100, 100)),
      logo: boxes(range(60, 120), boxRect(10, 300, 60, 30)),
    });
    expect(scene.stats).toMatchObject({
      creatorOnCameraShare: 0.2,
      creatorFirstSeen: 0,
      productShare: 0.4,
      productFirstSeen: 2,
      productInHook: true,
      logoShare: 0.4,
      logoFirstSeen: 4,
      logoInHook: false,
    });
  });

  it("is honest with nothing there", async () => {
    const { stats, covers, motion, body } = await build({});
    expect(stats).toMatchObject({ creatorOnCameraShare: 0, creatorFirstSeen: null, productFirstSeen: null, productLargest: null, productInHook: false, logoInHook: false });
    expect(stats.safeZone).toEqual({ product: 0, face: 0, logo: 0 });
    expect(covers).toEqual([]);
    expect(body).toEqual([]);
    expect(motion).toHaveLength(40);
    expect(motion.every((m) => m === 0)).toBe(true);
  });

  it("counts shots from the cuts", async () => {
    expect((await build({}, { shots: [2, 6] })).stats).toMatchObject({ shotCount: 3, averageShotS: 3.33, firstShotS: 2 });
    expect((await build({})).stats).toMatchObject({ shotCount: 1, averageShotS: 10, firstShotS: 10 });
  });

  it("takes the largest product from its mask when there is one", async () => {
    const half: Rect[] = [[100, 100, 200, 150]];
    const product = [line(3, record(0, half, { on: { left: 100, top: 100, right: 200, bottom: 200 } })), line(4, record(0, [boxRect(100, 100, 50, 50)], { mask: false }))];
    const { productLargest } = (await build({ product })).stats;
    expect(productLargest).toEqual({ t: 0.2, share: Math.round(((100 * 50) / (W * H)) * 10000) / 10000 });
  });

  it("measures the time under Instagram's UI out of the time on screen", async () => {
    const product = [...boxes(range(0, 10), boxRect(200, 800, 100, 100)), ...boxes(range(10, 40), boxRect(100, 400, 100, 100))];
    const scene = await build({
      product,
      face: boxes(range(0, 10), boxRect(100, 20, 100, 200)),
      logo: boxes(range(0, 10), boxRect(490, 400, 40, 40)),
    });
    expect(scene.stats.safeZone).toEqual({ product: 0.25, face: 1, logo: 1 });
  });

  it("knows the zones: top 10%, bottom 22%, right 14%", () => {
    expect(collidesWithUi([0.1, 0.02, 0.2, 0.05])).toBe(true);
    expect(collidesWithUi([0.1, 0.85, 0.2, 0.05])).toBe(true);
    expect(collidesWithUi([0.9, 0.4, 0.05, 0.05])).toBe(true);
    expect(collidesWithUi([0.1, 0.4, 0.2, 0.2])).toBe(false);
    expect(collidesWithUi([0.1, 0.1, 0.76, 0.68])).toBe(false);
    expect(collidesWithUi([0.1, 0.095, 0.2, 0.2])).toBe(false);
  });
});

describe("motion", () => {
  it("is one value per 0.25 s, zero when still or empty, higher when the body moves", async () => {
    const person = range(0, 60).map((f) => line(f, record(0, standing(f < 30 ? 200 : 200 + (f - 30) * 3))));
    const { motion } = await build({ person });
    expect(motion).toHaveLength(40);
    expect(motion.slice(0, 7).every((m) => m === 0)).toBe(true);
    expect(motion[10]).toBeGreaterThan(0.05);
    expect(motion[30]).toBe(0);
  });

  it("doesn't count a cut as movement", async () => {
    const person = range(0, 20).map((f) => line(f, record(0, standing(f < 10 ? 100 : 400))));
    expect((await build({ person }, { shots: [10 / FPS] })).motion.every((m) => m === 0)).toBe(true);
    expect((await build({ person })).motion[2]).toBeGreaterThan(0.5);
  });
});

describe("covers", () => {
  const face = boxes(range(0, 150), faceBox());

  it("needs the face and the product together", async () => {
    expect((await build({ face, product: [] })).covers).toEqual([]);
    expect((await build({ face: boxes(range(0, 10), faceBox()), product: boxes(range(20, 40), boxRect(200, 300, 100, 40)) })).covers).toEqual([]);
  });

  it("prefers a large product, at least 2 s apart, and says why", async () => {
    const product = [...boxes(range(0, 60), boxRect(200, 300, 60, 30)), ...boxes(range(60, 90), boxRect(150, 300, 240, 120)), ...boxes(range(90, 150), boxRect(200, 300, 60, 30))];
    const { covers } = await build({ face, product });
    expect(covers).toHaveLength(3);
    expect(covers[0].t).toBeGreaterThanOrEqual(4);
    expect(covers[0].t).toBeLessThan(6);
    expect(covers[0].score).toBeGreaterThan(covers[1].score);
    expect(Math.abs(covers[0].t - covers[1].t)).toBeGreaterThanOrEqual(2);
    expect(covers[0].why).toContain("5.6% of the frame");
    expect(covers.every((c) => !/[—]|--/.test(c.why))).toBe(true);
  });

  it("stays away from a cut", async () => {
    const product = boxes(range(0, 150), boxRect(200, 300, 100, 40));
    const { covers } = await build({ face, product }, { shots: [0.2, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 9.2] });
    for (const cover of covers) expect(Math.min(...[0.2, 1.2, 2.2, 3.2, 4.2, 5.2, 6.2, 7.2, 8.2, 9.2].map((s) => Math.abs(s - cover.t)))).toBeGreaterThan(0.3);
  });
});

describe("the whole answer", () => {
  it("passes the rest through and adds what was spent before the worker", async () => {
    const scene = await buildSceneData(raw({}, { shots: [5, 2, 0, 11] }), { product: "sunglasses", logo: "logo" }, 0.0123);
    expect(scene).toMatchObject({
      version: 1,
      duration_s: 10,
      fps: 15,
      width: 540,
      height: 960,
      phrases: { product: "sunglasses", logo: "logo" },
      shots: [2, 5],
      waveform: [0, 128, 255],
      cost_usd: 0.5123,
      sprite: { src: "data:image/jpeg;base64,AAAA", cols: 10, rows: 1, tile_w: 90, tile_h: 160, every_s: 1 },
    });
  });

  it("stops when SAM ran nothing at all", async () => {
    const dead = raw({});
    for (const concept of Object.values(dead.concepts)) concept.error = "SAM 3.1 could not finish this concept.";
    await expect(buildSceneData(dead, { product: "x", logo: "logo" })).rejects.toThrow("SAM 3.1 could not finish this concept.");
  });

  it("carries on with boxes where masks were stripped", async () => {
    const scene = await build({ person: [line(0, record(0, standing(), { mask: false }))], face: boxes([0], faceBox()) });
    expect(scene.body).toEqual([]);
    expect(scene.lanes.creator).toEqual([{ t_start: 0, t_end: 0.067 }]);
  });

  it("reads the lines the worker really sends: blank ones and all", async () => {
    const scene = await build({ logo: ["", `${line(0, record(0, [boxRect(10, 10, 20, 20)], { mask: false }))}\n`, "  ", line(1, record(0, [boxRect(10, 10, 20, 20)], { mask: false }))] });
    expect(scene.tracks.logo.map((f) => f.t)).toEqual([0, 0.067]);
  });
});

import { describe, expect, it } from "vitest";
import type { Box, Moment } from "@/lib/details";
import { CLEAR_OF_UI } from "@/lib/details";
import type { Report } from "@/lib/report";
import type { BodyFrame, SceneData, TrackFrame } from "@/lib/scene";
import {
  bodyAt,
  brandMentions,
  brandWords,
  buildCamera,
  cameraAt,
  catmullRom,
  clauseAt,
  cropSize,
  fixesAt,
  frameTimecode,
  ghostLogoBox,
  handsAt,
  holdBracket,
  indexScene,
  nextStop,
  outlineShift,
  placeMarkers,
  readoutAt,
  SAFE_CORNER,
  shotOf,
  smoothTrack,
  springStep,
  stopsFrom,
  trackAt,
  zoomedScroll,
} from "./geometry";

const ring = (cx: number, cy: number, radius: number, start = 0) =>
  Array.from({ length: 48 }, (_, i) => {
    const angle = ((i + start) / 48) * 2 * Math.PI;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }).flat();

const bodyFrame = (t: number, cx: number, opts: Partial<BodyFrame> = {}): BodyFrame => ({
  t,
  box: [cx - 0.1, 0.2, 0.2, 0.6],
  share: 0.1,
  outline: ring(cx, 0.5, 0.1),
  spine: Array.from({ length: 12 }, (_, i) => [cx, 0.2 + i * 0.05]).flat(),
  ...opts,
});

const track = (t: number, box: Box): TrackFrame => ({ t, box, c: 0.9 });

function sceneWith(partial: Partial<SceneData>): SceneData {
  return {
    version: 1,
    duration_s: 10,
    fps: 10,
    width: 540,
    height: 960,
    phrases: { product: "sunglasses", logo: "logo" },
    failed: [],
    body: [],
    tracks: { face: [], product: [], hand: [], logo: [] },
    lanes: { creator: [], product: [], logo: [], logoMissing: [], hand: [], productInHand: [] },
    motion: [],
    shots: [],
    waveform: [],
    sprite: { src: "", cols: 1, rows: 1, tile_w: 90, tile_h: 160, every_s: 1 },
    covers: [],
    stats: {
      creatorOnCameraShare: 0,
      creatorFirstSeen: null,
      productShare: 0,
      productFirstSeen: null,
      productLargest: null,
      productInHook: false,
      logoShare: 0,
      logoFirstSeen: null,
      logoInHook: false,
      shotCount: 1,
      averageShotS: 10,
      firstShotS: 10,
      safeZone: { product: 0, face: 0, logo: 0 },
    },
    cost_usd: 0,
    ...partial,
  };
}

describe("frameTimecode", () => {
  it("counts frames at 30 fps", () => {
    expect(frameTimecode(0)).toBe("00:00:00");
    expect(frameTimecode(12.5)).toBe("00:12:15");
    expect(frameTimecode(61 + 29 / 30)).toBe("01:01:29");
  });
});

describe("shotOf", () => {
  it("counts the cuts at or before a time", () => {
    expect(shotOf([3, 6], 0)).toBe(0);
    expect(shotOf([3, 6], 2.9)).toBe(0);
    expect(shotOf([3, 6], 3)).toBe(1);
    expect(shotOf([3, 6], 7)).toBe(2);
  });
});

describe("bodyAt", () => {
  const body = [bodyFrame(0, 0.3), bodyFrame(0.2, 0.5), bodyFrame(0.4, 0.7)];

  it("blends between two frames", () => {
    const now = bodyAt(indexScene(sceneWith({ body })), 0.1)!;
    expect(now.outline[0]).toBeCloseTo(0.5, 3);
    expect(now.spine![0]).toBeCloseTo(0.4, 5);
    expect(now.box[0]).toBeCloseTo(0.3, 5);
  });

  it("never blends across a cut: each side holds its own frame", () => {
    const ix = indexScene(sceneWith({ body, shots: [0.1] }));
    expect(bodyAt(ix, 0.05)!.outline).toEqual(body[0].outline);
    expect(bodyAt(ix, 0.15)!.outline).toEqual(body[1].outline);
  });

  it("never blends across a gap, and draws nothing in the middle of one", () => {
    const gapped = [bodyFrame(0, 0.3), bodyFrame(0.2, 0.3), bodyFrame(2, 0.8), bodyFrame(2.2, 0.8)];
    const ix = indexScene(sceneWith({ body: gapped }));
    expect(bodyAt(ix, 1)).toBeNull();
    expect(bodyAt(ix, 0.3)!.outline).toEqual(gapped[1].outline);
    expect(bodyAt(ix, 1.9)!.outline).toEqual(gapped[2].outline);
  });

  it("has nothing before the first frame's reach or after the last", () => {
    const ix = indexScene(sceneWith({ body: [bodyFrame(2, 0.3), bodyFrame(2.2, 0.3)] }));
    expect(bodyAt(ix, 0.5)).toBeNull();
    expect(bodyAt(ix, 5)).toBeNull();
  });

  it("only blends the spine when both frames have one", () => {
    const ix = indexScene(sceneWith({ body: [bodyFrame(0, 0.3), bodyFrame(0.2, 0.5, { spine: null })] }));
    expect(bodyAt(ix, 0.05)!.spine).toEqual(bodyFrame(0, 0.3).spine);
    expect(bodyAt(ix, 0.15)!.spine).toBeNull();
  });

  it("lines outlines up when the starting point hops, instead of spinning them", () => {
    const a = ring(0.5, 0.5, 0.1);
    const b = ring(0.5, 0.5, 0.1, 5);
    expect(outlineShift(a, b)).toBe(-5);
    const ix = indexScene(sceneWith({ body: [bodyFrame(0, 0.5, { outline: a }), bodyFrame(0.2, 0.5, { outline: b })] }));
    const now = bodyAt(ix, 0.1)!;
    for (let i = 0; i < 48; i++) {
      // Every point stays on the ring: a blend without the turn would cut across it.
      expect(Math.hypot(now.outline[i * 2] - 0.5, now.outline[i * 2 + 1] - 0.5)).toBeCloseTo(0.1, 3);
    }
  });
});

describe("trackAt and smoothTrack", () => {
  const frames = [track(0, [0.1, 0.1, 0.2, 0.2]), track(0.1, [0.2, 0.1, 0.2, 0.2]), track(0.2, [0.3, 0.1, 0.2, 0.2])];

  it("blends in a shot and stops at a cut and a gap", () => {
    expect(trackAt(frames, 0.05, [], 0.1)![0]).toBeCloseTo(0.15, 5);
    expect(trackAt(frames, 0.05, [0.08], 0.1)![0]).toBeCloseTo(0.1, 5);
    expect(trackAt(frames, 0.09, [0.08], 0.1)![0]).toBeCloseTo(0.2, 5);
    expect(trackAt(frames, 3, [], 0.1)).toBeNull();
  });

  it("calms jitter without crossing a cut", () => {
    const jitter = [track(0, [0.1, 0, 0.1, 0.1]), track(0.1, [0.14, 0, 0.1, 0.1]), track(0.2, [0.1, 0, 0.1, 0.1]), track(0.3, [0.14, 0, 0.1, 0.1]), track(0.4, [0.9, 0, 0.1, 0.1])];
    const smooth = smoothTrack(jitter, [0.35], 0.1);
    expect(smooth[1].box[0]).toBeCloseTo(0.12, 5);
    expect(smooth[4].box[0]).toBeCloseTo(0.9, 5);
    expect(smooth[3].box[0]).toBeLessThan(0.2);
  });
});

describe("handsAt", () => {
  it("pairs each hand with the nearest in the next frame", () => {
    const left: Box = [0.1, 0.5, 0.1, 0.1];
    const right: Box = [0.7, 0.5, 0.1, 0.1];
    const hand = [track(0, left), track(0, right), track(0.1, [0.72, 0.5, 0.1, 0.1]), track(0.1, [0.12, 0.5, 0.1, 0.1])];
    const ix = indexScene(sceneWith({ tracks: { face: [], product: [], logo: [], hand } }));
    const boxes = handsAt(ix, 0.05);
    expect(boxes[0][0]).toBeCloseTo(0.11, 5);
    expect(boxes[1][0]).toBeCloseTo(0.71, 5);
  });
});

describe("catmullRom", () => {
  it("passes through every point of an open curve", () => {
    const points = [0, 0, 1, 0, 2, 1, 3, 1];
    const curve = catmullRom(points, false);
    expect(curve.length).toBe(18);
    expect(curve.slice(4, 6)).toEqual([1, 0]);
    expect(curve.slice(10, 12)).toEqual([2, 1]);
    expect(curve.slice(16, 18)).toEqual([3, 1]);
  });

  it("closes a loop and keeps a straight line straight", () => {
    expect(catmullRom([0, 0, 1, 0, 1, 1, 0, 1], true).slice(-2)).toEqual([0, 0]);
    const line = catmullRom([0, 0, 1, 1, 2, 2], false);
    for (let i = 0; i < line.length; i += 2) expect(line[i]).toBeCloseTo(line[i + 1], 9);
  });
});

describe("reframe camera", () => {
  it("sizes the largest crop of a shape in the frame", () => {
    expect(cropSize(1, 9, 16)).toEqual({ w: 1, h: 9 / 16 });
    const fourFive = cropSize(4 / 5, 9, 16);
    expect(fourFive.w).toBe(1);
    expect(fourFive.h).toBeCloseTo(0.703, 3);
    expect(cropSize(1, 16, 9).w).toBeCloseTo(9 / 16, 9);
    expect(cropSize(1, 16, 9).h).toBe(1);
  });

  it("settles on the target with no overshoot", () => {
    let [x, v] = [0, 0];
    let last = 0;
    for (let i = 0; i < 150; i++) {
      [x, v] = springStep(x, v, 1, 6, 1 / 30);
      expect(x).toBeGreaterThanOrEqual(last);
      expect(x).toBeLessThanOrEqual(1);
      last = x;
    }
    expect(x).toBeCloseTo(1, 3);
  });

  const moving = Array.from({ length: 50 }, (_, i) => bodyFrame(i * 0.2, 0.5, { box: [0.3, i < 25 ? 0.05 : 0.5, 0.4, 0.3] }));

  it("follows the body smoothly and stays inside the frame", () => {
    const camera = buildCamera(indexScene(sceneWith({ body: moving })), 1);
    expect(camera.h).toBeCloseTo(9 / 16, 5);
    for (let i = 1; i < camera.y.length; i++) {
      expect(camera.y[i]).toBeGreaterThanOrEqual(0);
      expect(camera.y[i] + camera.h).toBeLessThanOrEqual(1.0001);
      // A camera move, not a jump: the target jumps at 5 s and the camera doesn't.
      expect(Math.abs(camera.y[i] - camera.y[i - 1])).toBeLessThan(0.04);
    }
    expect(cameraAt(camera, 4.9)[1]).toBeLessThan(0.02);
    expect(cameraAt(camera, 9.9)[1]).toBeGreaterThan(0.3);
  });

  it("cuts when the Reel cuts", () => {
    const camera = buildCamera(indexScene(sceneWith({ body: moving, shots: [5] })), 1);
    const before = cameraAt(camera, 4.95)[1];
    const after = cameraAt(camera, 5.04)[1];
    expect(after - before).toBeGreaterThan(0.2);
  });

  it("puts a face on the upper third of the crop", () => {
    const face = Array.from({ length: 100 }, (_, i) => track(i * 0.1, [0.4, 0.3, 0.2, 0.1]));
    const camera = buildCamera(indexScene(sceneWith({ body: moving, tracks: { face, product: [], hand: [], logo: [] } })), 1);
    const crop = cameraAt(camera, 9);
    expect((0.35 - crop[1]) / crop[3]).toBeCloseTo(1 / 3, 2);
  });
});

describe("ghostLogoBox", () => {
  const inClear = ([x, y, w, h]: Box) => x >= CLEAR_OF_UI.x0 && y >= CLEAR_OF_UI.y0 && x + w <= CLEAR_OF_UI.x1 && y + h <= CLEAR_OF_UI.y1;

  it("sits in the safe corner with no product", () => {
    const box = ghostLogoBox(null, 1, 540, 960);
    expect(box[1]).toBe(SAFE_CORNER[1]);
    expect(box[0] + box[2]).toBeCloseTo(SAFE_CORNER[0] + SAFE_CORNER[2], 9);
    expect(inClear(box)).toBe(true);
  });

  it("sits beside the product and moves with it", () => {
    const a = ghostLogoBox([0.2, 0.3, 0.2, 0.05], 1, 540, 960);
    const b = ghostLogoBox([0.25, 0.32, 0.2, 0.05], 1, 540, 960);
    expect(a[0]).toBeCloseTo(0.425, 5);
    expect(b[0] - a[0]).toBeCloseTo(0.05, 5);
    expect(b[1] - a[1]).toBeCloseTo(0.02, 5);
  });

  it("goes to the product's left, and stays clear of Instagram's UI, near the edges", () => {
    const right = ghostLogoBox([0.7, 0.3, 0.2, 0.05], 1, 540, 960);
    expect(right[0] + right[2]).toBeLessThan(0.7);
    expect(inClear(right)).toBe(true);
    expect(inClear(ghostLogoBox([0.3, 0.02, 0.2, 0.03], 1, 540, 960))).toBe(true);
    expect(inClear(ghostLogoBox([0.3, 0.95, 0.2, 0.03], 3, 540, 960))).toBe(true);
    expect(inClear(ghostLogoBox([0, 0.5, 0.05, 0.1], 8, 540, 960))).toBe(true);
  });
});

describe("placeMarkers", () => {
  it("leaves markers where they are when they fit", () => {
    expect(placeMarkers([2, 5], 10, 18, 100)).toEqual([20, 50]);
  });

  it("keeps a marker at the very start inside the track", () => {
    expect(placeMarkers([0, 5], 10, 18, 100)).toEqual([9, 50]);
  });

  it("spreads markers that would overlap, in order", () => {
    expect(placeMarkers([1, 1.1, 1.2], 10, 18, 500)).toEqual([10, 28, 46]);
  });

  it("keeps a pile at the end inside the track", () => {
    const xs = placeMarkers([9.8, 9.9, 10], 10, 18, 100);
    expect(xs[2]).toBe(100);
    expect(xs[1]).toBe(82);
    expect(xs[0]).toBe(64);
  });
});

describe("zoomedScroll", () => {
  it("keeps the same moment under the cursor", () => {
    expect(zoomedScroll(0, 100, 10, 20)).toBe(100);
    expect(zoomedScroll(50, 100, 10, 40)).toBe(500);
    expect(zoomedScroll(0, 0, 10, 40)).toBe(0);
  });
});

describe("stops", () => {
  const stops = stopsFrom([12, 4, 4, 8.5]);

  it("sorts and removes repeats", () => {
    expect(stops).toEqual([4, 8.5, 12]);
  });

  it("jumps to the next and the previous, past the one it's on", () => {
    expect(nextStop(stops, 4, 1)).toBe(8.5);
    expect(nextStop(stops, 8.5, -1)).toBe(4);
    expect(nextStop(stops, 12, 1)).toBeNull();
    expect(nextStop(stops, 4, -1)).toBeNull();
  });
});

describe("holdBracket", () => {
  it("lays the hold from the longest stretch", () => {
    expect(holdBracket([{ t_start: 1, t_end: 2 }, { t_start: 5, t_end: 9 }], 3, 20)).toEqual({ t_start: 5, t_end: 8, held: 4, met: true });
  });

  it("starts at zero with no label, and stops at the end of the Reel", () => {
    expect(holdBracket([], 16, 48)).toEqual({ t_start: 0, t_end: 16, held: 0, met: false });
    expect(holdBracket([{ t_start: 40, t_end: 41 }], 16, 48).t_end).toBe(48);
  });
});

describe("brand words", () => {
  it("takes the name, the products and their telling words", () => {
    const words = brandWords("Meta", ["Ray-Ban Meta Gen 2"]);
    expect(words).toContain("ray ban meta gen 2");
    expect(words).toContain("meta");
    expect(words).toContain("ray");
    expect(words).not.toContain("gen");
    expect(words).not.toContain("2");
  });

  it("finds them in any case, not inside other words, and counts a long name once", () => {
    const words = brandWords("Meta", ["Ray-Ban Meta"]);
    const transcript = [
      { t_start: 10, t_end: 12, text: "with RAY-BAN Meta glasses", lang: "en" },
      { t_start: 20, t_end: 22, text: "the metaverse and metal", lang: "en" },
      { t_start: 30, t_end: 31, text: "hey meta", lang: "en" },
    ];
    const hits = brandMentions(transcript, words);
    expect(hits.map((h) => h.word)).toEqual(["ray ban meta", "meta"]);
    expect(hits[0].t).toBeGreaterThan(10);
    expect(hits[0].t).toBeLessThan(12);
    expect(hits[1].t_start).toBe(30);
  });

  it("counts words of one name said in a row as one mention", () => {
    const hits = brandMentions([{ t_start: 36, t_end: 38, text: "with Ray-Ban Meta AI glasses", lang: "en" }], brandWords("Meta", ["Ray-Ban Meta glasses"]));
    expect(hits.map((h) => h.word)).toEqual(["ray ban meta", "glasses"]);
  });

  it("finds Hindi the same way", () => {
    const hits = brandMentions([{ t_start: 0, t_end: 1, text: "यह मेटा का चश्मा", lang: "hi" }], ["मेटा"]);
    expect(hits).toHaveLength(1);
  });

  it("has nothing to find with no words", () => {
    expect(brandMentions([{ t_start: 0, t_end: 1, text: "hello", lang: "en" }], [])).toEqual([]);
  });
});

describe("the readout at the playhead", () => {
  const clause = { code: "ASCI-IG 1.2e.II", text: "x", source_url: null };
  const report = {
    tracks: [{ kind: "disclosure_label", spans: [{ t_start: 2, t_end: 4 }] }],
    checks: [
      { id: "label_present", title: "Label on screen", verdict: "PASS", clause: { ...clause, code: "ASCI-IG 1.3a" }, evidence: [{ t_start: 2, t_end: 4 }] },
      { id: "label_duration", title: "Held long enough", verdict: "FAIL", clause, evidence: [{ t_start: 2, t_end: 4 }] },
    ],
  } as unknown as Report;

  it("names the worst clause with evidence here, else the hold rule", () => {
    expect(clauseAt(report, 3)).toMatchObject({ code: "ASCI-IG 1.2e.II", here: true });
    expect(clauseAt(report, 8)).toMatchObject({ code: "ASCI-IG 1.2e.II", here: false });
  });

  it("reads what's measured and leaves the rest null with no scene", () => {
    const none = readoutAt(null, report, 3);
    expect(none.labelOn).toBe(true);
    expect(none.creator).toBeNull();
    expect(none.shot).toBeNull();

    const scene = sceneWith({
      shots: [5],
      motion: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5],
      lanes: { creator: [{ t_start: 0, t_end: 4 }], product: [], logo: [{ t_start: 2, t_end: 4 }], logoMissing: [], hand: [], productInHand: [] },
      tracks: { face: [], hand: [], logo: [], product: [track(3, [0, 0, 0.5, 0.2]), track(3.1, [0, 0, 0.5, 0.2])] },
    });
    const now = readoutAt(indexScene(scene), report, 3.05);
    expect(now).toMatchObject({ shot: 1, shots: 2, creator: true, logoSeen: true, motion: 0.5 });
    expect(now.productShare).toBeCloseTo(0.1, 5);
    expect(readoutAt(indexScene(scene), report, 6)).toMatchObject({ shot: 2, creator: false, logoSeen: false, productShare: 0 });
  });
});

describe("fixesAt", () => {
  const fix = { style: "pill" as const, text: "x", box: [0, 0, 1, 1] as Box, spans: [{ t_start: 1, t_end: 2 }] };
  const moments = [{ id: "a", fix }, { id: "b", fix }, { id: "c" }] as Moment[];

  it("lists what's showing, with the selected moment on top", () => {
    expect(fixesAt(moments, 1.5, null).map((f) => f.id)).toEqual(["a", "b"]);
    expect(fixesAt(moments, 1.5, "a").map((f) => f.id)).toEqual(["b", "a"]);
    expect(fixesAt(moments, 3, null)).toEqual([]);
  });
});

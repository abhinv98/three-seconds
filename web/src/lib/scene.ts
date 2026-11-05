import { decodeMaskToRaster, type SegmentationMask } from "@meta-sam/parser";
import type { Box } from "@/lib/details";

// SAM 3.1 tracks a few concepts through the whole Reel; this turns its raw output into what the Studio draws and
// measures: the creator's outline and spine, tracked boxes, timeline lanes, and the numbers on the scorecard.

export interface Stretch {
  t_start: number;
  t_end: number;
}

export interface TrackFrame {
  t: number;
  box: Box;
  c: number;
}

export interface BodyFrame {
  t: number;
  box: Box;
  /** Fraction of the frame the body mask covers. */
  share: number;
  /** Exactly 48 points, [x0, y0, x1, y1, ...], fractions, from the top point, clockwise, so frames interpolate. */
  outline: number[];
  /** Exactly 12 points from head to base, or null when no face is on this body in this frame. */
  spine: number[] | null;
}

export interface SceneStats {
  creatorOnCameraShare: number;
  creatorFirstSeen: number | null;
  productShare: number;
  productFirstSeen: number | null;
  productLargest: { t: number; share: number } | null;
  /** Hook is the first 3 seconds. */
  productInHook: boolean;
  logoShare: number;
  logoFirstSeen: number | null;
  logoInHook: boolean;
  shotCount: number;
  averageShotS: number;
  firstShotS: number;
  /** Of the time each one is on screen, the share it sits under Instagram's UI. */
  safeZone: { product: number; face: number; logo: number };
}

export interface SceneData {
  version: 1;
  duration_s: number;
  fps: number;
  width: number;
  height: number;
  phrases: { product: string; logo: string };
  /** Concepts SAM couldn't run. Their tracks and lanes are empty because nothing was measured, not because nothing was there. */
  failed: string[];
  /** Every second SAM frame. */
  body: BodyFrame[];
  /** In time order. face, product and logo have at most one box per frame; hand can have two at the same t. */
  tracks: { face: TrackFrame[]; product: TrackFrame[]; hand: TrackFrame[]; logo: TrackFrame[] };
  lanes: { creator: Stretch[]; product: Stretch[]; logo: Stretch[]; logoMissing: Stretch[]; hand: Stretch[]; productInHand: Stretch[] };
  /** 0 to 1 per 0.25 s, from the body's centroid and area change; 0 when no body. */
  motion: number[];
  shots: number[];
  waveform: number[];
  sprite: { src: string; cols: number; rows: number; tile_w: number; tile_h: number; every_s: number };
  covers: { t: number; score: number; why: string }[];
  stats: SceneStats;
  cost_usd: number;
}

/** What the worker's POST /scene answers. */
export interface WorkerScene {
  duration_s: number;
  width: number;
  height: number;
  fps: number;
  concepts: Record<string, { lines: string[]; error: string | null }>;
  shots: number[];
  waveform: number[];
  sprite: { jpeg: string; cols: number; rows: number; tile_w: number; tile_h: number; every_s: number };
  cost_usd: number;
  /** A big answer keeps 1 frame in n of a concept, so its gaps stretch by n. */
  thinned?: Record<string, number>;
}

export const MOTION_STEP_S = 0.25;
const HOOK_S = 3;
const OUTLINE_POINTS = 48;
const SPINE_POINTS = 12;
const SPINE_ROWS = 24;
const FLICKER_FRAMES = 3;
const LOGO_MISSING_S = 2;
/** Instagram's UI covers everything outside this part of a 9:16 frame: top 10%, bottom 22%, right 14%. */
const CLEAR_OF_UI = { x0: 0, y0: 0.1, x1: 0.86, y1: 0.78 };
/** Centroid and area change per second that counts as full motion. Fixed, so Reels can be compared. */
const MOTION_FULL = 1;

const round = (v: number, places = 4) => {
  const k = 10 ** places;
  return Math.round(v * k) / k;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Raw SAM output

interface Detection {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  c: number;
  mask?: SegmentationMask;
}

type Frames = Map<number, Detection[]>;

const FRAME_HEADER = /^<(\d+)f[^>]*>/;
const RECORD = /(\d+)<\|box;([^|]*)\|>(?:<\|mask;([^|]*)\|>)?/g;

const fieldsOf = (body: string) =>
  Object.fromEntries(
    body.split(";").map((field) => {
      const at = field.indexOf("=");
      return [field.slice(0, at), field.slice(at + 1)];
    }),
  ) as Record<string, string>;

function maskOf(body: string): SegmentationMask | undefined {
  const [height, width, payload] = fieldsOf(body).data?.split(",") ?? [];
  if (!payload) return undefined;
  return { encoding: payload[0] === "~" ? "lossless" : "one_bit", payload, width: Number(width), height: Number(height) };
}

/**
 * By hand and not with the package's parseVideoStream: it calls a record without a mask malformed and drops it, and the
 * worker strips the masks of concepts that only need boxes. The package still decodes the masks.
 */
function parseLines(lines: string[]): Frames {
  const frames: Frames = new Map();
  for (const line of lines) {
    const header = FRAME_HEADER.exec(line.trim());
    if (!header) continue;
    const detections: Detection[] = [];
    for (const [, id, box, mask] of line.matchAll(RECORD)) {
      const { x1, y1, x2, y2, c } = fieldsOf(box);
      const [left, top, right, bottom] = [Number(x1), Number(y1), Number(x2) + 1, Number(y2) + 1];
      if (![left, top, right, bottom].every(Number.isFinite)) continue;
      detections.push({ id, left, top, right, bottom, c: Number(c) || 0, mask: mask ? maskOf(mask) : undefined });
    }
    if (detections.length) frames.set(Number(header[1]), detections);
  }
  return frames;
}

const sortedKeys = (frames: Frames) => [...frames.keys()].sort((a, b) => a - b);
const area = (d: { left: number; top: number; right: number; bottom: number }) => (d.right - d.left) * (d.bottom - d.top);
const overlap = (a: Detection, b: Detection) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const iou = (a: Detection, b: Detection) => {
  const shared = overlap(a, b);
  return shared / (area(a) + area(b) - shared || 1);
};

/** The one box per frame a track keeps: stay on the object already followed, else the most confident. */
function followOne(frames: Frames): Map<number, Detection> {
  const kept = new Map<number, Detection>();
  let current: string | null = null;
  for (const f of sortedKeys(frames)) {
    const list = frames.get(f)!;
    const pick = list.find((d) => d.id === current) ?? list.reduce((a, b) => (b.c > a.c ? b : a));
    current = pick.id;
    kept.set(f, pick);
  }
  return kept;
}

/**
 * A product box that sits inside a logo box is the logo's own picture of the product (the glasses icon in a "Made with
 * Ray-Ban" tag reads as "sunglasses"), not the product. A logo printed on a real product is the other way round: the
 * logo box sits inside the product box, so that product stays.
 */
function withoutLogoLookalikes(products: Frames, logos: Frames): Frames {
  const kept: Frames = new Map();
  for (const [frame, list] of products) {
    const real = list.filter((p) => !(logos.get(frame) ?? []).some((l) => overlap(p, l) >= 0.5 * area(p)));
    if (real.length) kept.set(frame, real);
  }
  return kept;
}

// Rasters

interface Raster {
  data: Uint8Array;
  w: number;
  h: number;
  left: number;
  top: number;
  /** Frame pixels per mask pixel: the raster sits on the box but needn't match its size. */
  sx: number;
  sy: number;
  pixels: number;
  /** Centroid in frame pixels. */
  cx: number;
  cy: number;
}

function rasterOf(d: Detection): Raster | null {
  if (!d.mask) return null;
  const { width: w, height: h } = d.mask;
  let data: Uint8Array;
  try {
    data = decodeMaskToRaster(d.mask);
  } catch {
    return null;
  }
  const sx = (d.right - d.left) / w;
  const sy = (d.bottom - d.top) / h;
  let pixels = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (data[i]) {
        pixels++;
        sumX += x;
        sumY += y;
      }
    }
  }
  if (!pixels) return null;
  return { data, w, h, left: d.left, top: d.top, sx, sy, pixels, cx: d.left + ((sumX / pixels + 0.5) * sx), cy: d.top + ((sumY / pixels + 0.5) * sy) };
}

const NEIGHBOURS = [-1, 0, -1, -1, 0, -1, 1, -1, 1, 0, 1, 1, 0, 1, -1, 1];

/** Scan-order first pixel of the largest 8-connected blob, which is that blob's topmost, leftmost pixel. Union-find over each row's runs. */
function largestBlobStart(r: Raster): number {
  const parent: number[] = [];
  const size: number[] = [];
  const first: number[] = [];
  const find = (i: number) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  let above: number[] = [];
  for (let y = 0; y < r.h; y++) {
    const row: number[] = [];
    const base = y * r.w;
    for (let x = 0; x < r.w; x++) {
      if (!r.data[base + x]) continue;
      const a = x;
      while (x < r.w && r.data[base + x]) x++;
      const id = parent.length;
      parent.push(id);
      size.push(x - a);
      first.push(base + a);
      row.push(a, x, id);
      for (let k = 0; k < above.length; k += 3) {
        if (above[k] > x || above[k + 1] < a) continue;
        const p = find(above[k + 2]);
        const q = find(id);
        if (p === q) continue;
        parent[q] = p;
        size[p] += size[q];
        first[p] = Math.min(first[p], first[q]);
      }
    }
    above = row;
  }
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] === i && size[i] > bestSize) {
      bestSize = size[i];
      best = first[i];
    }
  }
  return best;
}

/** Moore neighbour walk round the blob, clockwise on screen. Returns [x, y, ...] in mask pixels. */
function traceContour(r: Raster, start: number): number[] {
  const startX = start % r.w;
  const startY = (start - startX) / r.w;
  const contour = [startX, startY];
  let x = startX;
  let y = startY;
  // The start is the blob's first pixel in scan order, so its west neighbour is empty.
  let back = 0;
  let firstMove = -1;
  const limit = 4 * r.data.length;
  for (let step = 0; step < limit; step++) {
    const atStart = x === startX && y === startY;
    let moved = -1;
    for (let k = 1; k <= 8; k++) {
      const d = (back + k) % 8;
      const nx = x + NEIGHBOURS[d * 2];
      const ny = y + NEIGHBOURS[d * 2 + 1];
      if (nx >= 0 && ny >= 0 && nx < r.w && ny < r.h && r.data[ny * r.w + nx]) {
        moved = d;
        x = nx;
        y = ny;
        break;
      }
    }
    // Back at the start and leaving the same way as the first time: one full lap.
    if (moved < 0 || (atStart && moved === firstMove)) break;
    if (firstMove < 0) firstMove = moved;
    contour.push(x, y);
    back = (moved + (moved % 2 ? 5 : 6)) % 8;
  }
  return contour;
}

/** Evenly spaced by arc length; closed adds the walk back to the first point. */
function resample(points: number[], count: number, closed: boolean): number[] {
  const pts = closed ? [...points, points[0], points[1]] : points;
  const lengths = [0];
  for (let i = 2; i < pts.length; i += 2) lengths.push(lengths[lengths.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  const total = lengths[lengths.length - 1];
  const out: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const at = (total * k) / (closed ? count : count - 1);
    while (j < lengths.length - 2 && lengths[j + 1] < at) j++;
    const span = lengths[j + 1] - lengths[j] || 1;
    const u = (at - lengths[j]) / span;
    out.push(pts[j * 2] + (pts[j * 2 + 2] - pts[j * 2]) * u, pts[j * 2 + 1] + (pts[j * 2 + 3] - pts[j * 2 + 1]) * u);
  }
  return out;
}

/** The body's outline as 48 points in frame pixels. */
function outlineOf(r: Raster): number[] {
  const contour = traceContour(r, largestBlobStart(r));
  let minY = Infinity;
  for (let i = 1; i < contour.length; i += 2) minY = Math.min(minY, contour[i]);
  const tops: number[] = [];
  for (let i = 0; i < contour.length; i += 2) if (contour[i + 1] === minY) tops.push(i);
  // The middle of a flat top, so the start doesn't hop from one end of it to the other between frames.
  const startAt = tops[tops.length >> 1];
  const rotated = [...contour.slice(startAt), ...contour.slice(0, startAt)];
  const inFrame = rotated.map((v, i) => (i % 2 ? r.top + (v + 0.5) * r.sy : r.left + (v + 0.5) * r.sx));
  return resample(inFrame, OUTLINE_POINTS, true);
}

function faceOnMask(r: Raster, face: Detection): boolean {
  let hits = 0;
  const samples = 8;
  for (let v = 0; v < samples; v++) {
    for (let u = 0; u < samples; u++) {
      const x = Math.floor((face.left + ((u + 0.5) / samples) * (face.right - face.left) - r.left) / r.sx);
      const y = Math.floor((face.top + ((v + 0.5) / samples) * (face.bottom - face.top) - r.top) / r.sy);
      if (x >= 0 && y >= 0 && x < r.w && y < r.h && r.data[y * r.w + x]) hits++;
    }
  }
  return hits >= 0.25 * samples * samples;
}

/** The mask's runs across one frame row, in frame pixels, with hand boxes cut out. */
function rowRuns(r: Raster, y: number, hands: Detection[]): [number, number][] {
  const row = Math.floor((y - r.top) / r.sy);
  if (row < 0 || row >= r.h) return [];
  let runs: [number, number][] = [];
  const base = row * r.w;
  for (let x = 0; x < r.w; x++) {
    if (!r.data[base + x]) continue;
    const a = x;
    while (x < r.w && r.data[base + x]) x++;
    runs.push([r.left + a * r.sx, r.left + x * r.sx]);
  }
  for (const hand of hands) {
    const growX = 0.1 * (hand.right - hand.left);
    const growY = 0.1 * (hand.bottom - hand.top);
    if (y < hand.top - growY || y > hand.bottom + growY) continue;
    const cutA = hand.left - growX;
    const cutB = hand.right + growX;
    runs = runs.flatMap(([a, b]): [number, number][] => {
      if (b <= cutA || a >= cutB) return [[a, b]];
      const left: [number, number][] = a < cutA ? [[a, cutA]] : [];
      const right: [number, number][] = b > cutB ? [[cutB, b]] : [];
      return [...left, ...right];
    });
  }
  return runs;
}

/**
 * Crown, face centre, then down the middle of the body. Each row looks only within a torso's reach of the line so far
 * (about three face widths across), so an arm held out can't pull it, and takes the middle of what's there, so a hand
 * cut out of the chest or a gap between the legs doesn't move it either.
 */
function spineOf(r: Raster, face: Detection, hands: Detection[]): number[] | null {
  const faceWidth = face.right - face.left;
  const crownX = face.left + faceWidth / 2;
  const faceY = (face.top + face.bottom) / 2;
  let lastRow = r.h - 1;
  for (; lastRow >= 0; lastRow--) {
    let any = false;
    for (let x = 0; x < r.w && !any; x++) any = r.data[lastRow * r.w + x] === 1;
    if (any) break;
  }
  const bottom = r.top + (lastRow + 1) * r.sy;
  if (bottom - face.bottom < 0.25 * (face.bottom - face.top)) return null;

  const reach = 1.5 * faceWidth;
  const step = (bottom - 1 - face.bottom) / (SPINE_ROWS - 1);
  const maxMove = 0.6 * step;
  const xs: number[] = [];
  const ys: number[] = [];
  let line = crownX;
  for (let i = 0; i < SPINE_ROWS; i++) {
    const y = face.bottom + i * step;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [a, b] of rowRuns(r, y, hands)) {
      if (b < line - reach || a > line + reach) continue;
      lo = Math.min(lo, Math.max(a, line - reach));
      hi = Math.max(hi, Math.min(b, line + reach));
    }
    if (lo > hi) continue;
    line += clamp((lo + hi) / 2 - line, -maxMove, maxMove);
    xs.push(line);
    ys.push(y);
  }
  if (xs.length < 3) return null;

  const path = [crownX, face.top, crownX, faceY];
  let previous = crownX;
  for (let i = 0; i < xs.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(xs.length - 1, i + 2); j++, count++) sum += xs[j];
    previous += clamp(sum / count - previous, -maxMove, maxMove);
    path.push(previous, ys[i]);
  }
  return resample(path, SPINE_POINTS, false);
}

// Bodies

interface BodyCalc {
  frame: number;
  shot: number;
  id: string;
  detection: Detection;
  share: number;
  cx: number;
  cy: number;
  outline: number[];
  spine: number[] | null;
  hasFace: boolean;
}

const SMOOTH_RADIUS = 2;
const MAX_GAP_FRAMES = 2;

/** Each spine point over a centred 5-frame window, stopping at a cut, a change of body or a gap over 2 frames. */
function smoothSpines(bodies: BodyCalc[], thin: number) {
  const linked = (a: BodyCalc, b: BodyCalc) => a.shot === b.shot && a.id === b.id && b.frame - a.frame - 1 <= MAX_GAP_FRAMES * thin;
  const smoothed = bodies.map((body, i) => {
    if (!body.spine) return null;
    const window = [body.spine];
    for (let j = i - 1; j >= Math.max(0, i - SMOOTH_RADIUS) && bodies[j].spine && linked(bodies[j], bodies[j + 1]); j--) window.push(bodies[j].spine!);
    for (let j = i + 1; j <= Math.min(bodies.length - 1, i + SMOOTH_RADIUS) && bodies[j].spine && linked(bodies[j - 1], bodies[j]); j++) window.push(bodies[j].spine!);
    return body.spine.map((_, k) => window.reduce((sum, spine) => sum + spine[k], 0) / window.length);
  });
  bodies.forEach((body, i) => {
    body.spine = smoothed[i];
  });
}

function pickBody(people: Detection[], faces: Detection[], previous: Detection | null): Detection {
  const holdsFace = people.filter((p) => faces.some((f) => overlap(p, f) >= 0.6 * area(f)));
  const pool = holdsFace.length ? holdsFace : people;
  const same = previous && pool.find((p) => p.id === previous.id || iou(p, previous) > 0.5);
  return same || pool.reduce((a, b) => (area(b) > area(a) ? b : a));
}

// Lanes

function toStretches(frames: number[], fps: number, duration: number, thin = 1): Stretch[] {
  const out: Stretch[] = [];
  let start = -1;
  let last = -1;
  const close = () => out.push({ t_start: round(start / fps, 3), t_end: round(Math.min(duration, (last + thin) / fps), 3) });
  for (const f of frames) {
    if (start < 0) start = f;
    else if (f - last - 1 > FLICKER_FRAMES * thin) {
      close();
      start = f;
    }
    last = f;
  }
  if (start >= 0) close();
  return out;
}

const totalOf = (stretches: Stretch[]) => stretches.reduce((sum, s) => sum + (s.t_end - s.t_start), 0);

/** Stretches over 2 s with nothing in them, including at the start and the end. */
function missingFrom(lane: Stretch[], duration: number): Stretch[] {
  const out: Stretch[] = [];
  let at = 0;
  for (const s of [...lane, { t_start: duration, t_end: duration }]) {
    if (s.t_start - at > LOGO_MISSING_S) out.push({ t_start: round(at, 3), t_end: round(s.t_start, 3) });
    at = s.t_end;
  }
  return out;
}

/** The share of a box that sits under Instagram's UI, 0 to 1. Box is [x, y, w, h] in fractions of the frame. */
export function underUiShare([x, y, w, h]: Box): number {
  const inside = Math.max(0, Math.min(x + w, CLEAR_OF_UI.x1) - Math.max(x, CLEAR_OF_UI.x0)) * Math.max(0, Math.min(y + h, CLEAR_OF_UI.y1) - Math.max(y, CLEAR_OF_UI.y0));
  return 1 - inside / (w * h || 1);
}

/** A box counts as colliding once a tenth of it is under the UI, not when one edge just grazes it. */
export const collidesWithUi = (box: Box) => underUiShare(box) >= 0.1;

const collisionShare = (track: TrackFrame[]) => (track.length ? round(track.filter((f) => collidesWithUi(f.box)).length / track.length) : 0);

// The whole scene

/** Turns the worker's answer into the Studio's data. extraCostUsd is anything spent before the worker ran. */
export async function buildSceneData(raw: WorkerScene, phrases: SceneData["phrases"], extraCostUsd = 0): Promise<SceneData> {
  const { duration_s: duration, width, height, fps } = raw;
  const failed = Object.entries(raw.concepts)
    .filter(([, concept]) => concept.error)
    .map(([id]) => id);
  if (["person", "face", "hand", "product", "logo"].every((id) => failed.includes(id) || !raw.concepts[id])) {
    throw new Error(raw.concepts.person?.error ?? "SAM 3.1 couldn't read this Reel.");
  }
  const [person, face, hand, product, logo] = ["person", "face", "hand", "product", "logo"].map((id) => parseLines(raw.concepts[id]?.lines ?? []));
  const thinOf = (id: string) => raw.thinned?.[id] ?? 1;
  const bodyThin = thinOf("person");
  const shots = raw.shots.filter((s) => s > 0 && s < duration).sort((a, b) => a - b);
  const shotAt = (frame: number) => {
    const t = frame / fps + 1e-3;
    let shot = 0;
    while (shot < shots.length && shots[shot] <= t) shot++;
    return shot;
  };
  const toBox = (d: Detection): Box => [round(d.left / width), round(d.top / height), round((d.right - d.left) / width), round((d.bottom - d.top) / height)];
  const toTrack = (frame: number, d: Detection): TrackFrame => ({ t: round(frame / fps, 3), box: toBox(d), c: round(d.c, 2) });

  // Decoding every mask is the slow part: hand the event loop back now and then, since the finer read shares this process.
  const breathe = () => new Promise((resolve) => setTimeout(resolve));

  const bodies: BodyCalc[] = [];
  let previous: Detection | null = null;
  let previousFrame = -Infinity;
  const personFrames = sortedKeys(person);
  for (let n = 0; n < personFrames.length; n++) {
    if (n % 32 === 31) await breathe();
    const frame = personFrames[n];
    const shot = shotAt(frame);
    if (frame - previousFrame - 1 > FLICKER_FRAMES * bodyThin || shotAt(previousFrame) !== shot) previous = null;
    const faces = face.get(frame) ?? [];
    const pick: Detection = pickBody(person.get(frame)!, faces, previous);
    previous = pick;
    previousFrame = frame;
    const raster = rasterOf(pick);
    if (!raster) continue;
    const onBody = faces.filter((f) => overlap(pick, f) > 0 && faceOnMask(raster, f)).sort((a, b) => overlap(pick, b) - overlap(pick, a))[0];
    bodies.push({
      frame,
      shot,
      id: pick.id,
      detection: pick,
      share: (raster.pixels * raster.sx * raster.sy) / (width * height),
      cx: raster.cx / width,
      cy: raster.cy / height,
      outline: outlineOf(raster),
      spine: onBody ? spineOf(raster, onBody, hand.get(frame) ?? []) : null,
      hasFace: Boolean(onBody),
    });
  }
  smoothSpines(bodies, bodyThin);

  const fractions = (points: number[]) => points.map((v, i) => round(clamp(v / (i % 2 ? height : width), 0, 1)));
  // By spacing and not frame % 2: after a gap, or in a thinned track, every frame left can be odd.
  let lastKept = -Infinity;
  const body: BodyFrame[] = bodies
    .filter((b) => {
      if (b.frame - lastKept < 2) return false;
      lastKept = b.frame;
      return true;
    })
    .map((b) => ({
      t: round(b.frame / fps, 3),
      box: toBox(b.detection),
      share: round(b.share),
      outline: fractions(b.outline),
      spine: b.spine && fractions(b.spine),
    }));

  const faceFrames = followOne(face);
  const productFrames = followOne(withoutLogoLookalikes(product, logo));
  const logoFrames = followOne(logo);
  const inOrder = (frames: Map<number, Detection>) => [...frames].map(([f, d]) => toTrack(f, d));
  const tracks: SceneData["tracks"] = {
    face: inOrder(faceFrames),
    product: inOrder(productFrames),
    hand: sortedKeys(hand).flatMap((f) => hand.get(f)!.map((d) => toTrack(f, d))),
    logo: inOrder(logoFrames),
  };

  const creatorFrames = [...new Set([...onCameraFrames(bodies, bodyThin), ...faceFrames.keys()])].sort((a, b) => a - b);
  const inHandFrames = [...productFrames]
    .filter(([f, p]) => (hand.get(f) ?? []).some((h) => overlap(h, p) >= 0.2 * Math.min(area(h), area(p))))
    .map(([f]) => f);
  const logoLane = toStretches([...logoFrames.keys()], fps, duration, thinOf("logo"));
  const lanes: SceneData["lanes"] = {
    creator: toStretches(creatorFrames, fps, duration, bodyThin),
    product: toStretches([...productFrames.keys()], fps, duration, thinOf("product")),
    logo: logoLane,
    logoMissing: failed.includes("logo") || !raw.concepts.logo ? [] : missingFrom(logoLane, duration),
    hand: toStretches(sortedKeys(hand), fps, duration, thinOf("hand")),
    productInHand: toStretches(inHandFrames, fps, duration, thinOf("product")),
  };

  const motion = motionOf(bodies, duration, fps, bodyThin);
  const productLargest = largestProduct(productFrames, width, height, fps);
  const covers = pickCovers(faceFrames, productFrames, shots, motion, { width, height, fps, duration });
  const share = (lane: Stretch[]) => (duration ? round(totalOf(lane) / duration) : 0);
  const stats: SceneStats = {
    creatorOnCameraShare: share(lanes.creator),
    creatorFirstSeen: lanes.creator[0]?.t_start ?? null,
    productShare: share(lanes.product),
    productFirstSeen: lanes.product[0]?.t_start ?? null,
    productLargest,
    productInHook: lanes.product[0] !== undefined && lanes.product[0].t_start < HOOK_S,
    logoShare: share(lanes.logo),
    logoFirstSeen: lanes.logo[0]?.t_start ?? null,
    logoInHook: lanes.logo[0] !== undefined && lanes.logo[0].t_start < HOOK_S,
    shotCount: shots.length + 1,
    averageShotS: round(duration / (shots.length + 1), 2),
    firstShotS: round(shots[0] ?? duration, 2),
    safeZone: { product: collisionShare(tracks.product), face: collisionShare(tracks.face), logo: collisionShare(tracks.logo) },
  };

  return {
    version: 1,
    duration_s: duration,
    fps,
    width,
    height,
    phrases,
    failed,
    body,
    tracks,
    lanes,
    motion,
    shots,
    waveform: raw.waveform,
    sprite: {
      src: `data:image/jpeg;base64,${raw.sprite.jpeg}`,
      cols: raw.sprite.cols,
      rows: raw.sprite.rows,
      tile_w: raw.sprite.tile_w,
      tile_h: raw.sprite.tile_h,
      every_s: raw.sprite.every_s,
    },
    covers,
    stats,
    cost_usd: round(raw.cost_usd + extraCostUsd),
  };
}

/**
 * Frames where the creator is on camera: bodies with a face on them, plus the rest of that body's stretch in the same
 * shot. A body that never shows a face in its shot is taken for an arm or a hand in a POV shot.
 * ponytail: someone seen only from behind counts as off camera too; tell them apart by mask shape if a Reel needs it.
 */
function onCameraFrames(bodies: BodyCalc[], thin: number): number[] {
  const frames: number[] = [];
  let i = 0;
  while (i < bodies.length) {
    let j = i;
    while (j + 1 < bodies.length && bodies[j + 1].shot === bodies[i].shot && bodies[j + 1].id === bodies[i].id && bodies[j + 1].frame - bodies[j].frame - 1 <= FLICKER_FRAMES * thin) j++;
    const stretch = bodies.slice(i, j + 1);
    if (stretch.some((b) => b.hasFace)) frames.push(...stretch.map((b) => b.frame));
    i = j + 1;
  }
  return frames;
}

function motionOf(bodies: BodyCalc[], duration: number, fps: number, thin: number): number[] {
  const sums = new Array<number>(Math.ceil(duration / MOTION_STEP_S)).fill(0);
  const counts = new Array<number>(sums.length).fill(0);
  for (let i = 1; i < bodies.length; i++) {
    const a = bodies[i - 1];
    const b = bodies[i];
    if (a.shot !== b.shot || b.frame - a.frame - 1 > MAX_GAP_FRAMES * thin) continue;
    const seconds = (b.frame - a.frame) / fps;
    const bin = Math.min(sums.length - 1, Math.floor(b.frame / fps / MOTION_STEP_S));
    sums[bin] += (Math.hypot(b.cx - a.cx, b.cy - a.cy) + Math.abs(b.share - a.share)) / seconds;
    counts[bin]++;
  }
  return sums.map((sum, i) => (counts[i] ? round(clamp(sum / counts[i] / MOTION_FULL, 0, 1), 3) : 0));
}

function shareOfFrame(d: Detection, width: number, height: number): number {
  const raster = rasterOf(d);
  return raster ? (raster.pixels * raster.sx * raster.sy) / (width * height) : area(d) / (width * height);
}

function largestProduct(frames: Map<number, Detection>, width: number, height: number, fps: number): SceneStats["productLargest"] {
  let best: SceneStats["productLargest"] = null;
  for (const [f, d] of frames) {
    const share = shareOfFrame(d, width, height);
    if (!best || share > best.share) best = { t: round(f / fps, 3), share: round(share) };
  }
  return best;
}

const COVER_GAP_S = 2;

/** Face and product both in frame, the product large, the body calm, the frame away from a cut. */
function pickCovers(
  faces: Map<number, Detection>,
  products: Map<number, Detection>,
  shots: number[],
  motion: number[],
  { width, height, fps, duration }: { width: number; height: number; fps: number; duration: number },
): SceneData["covers"] {
  const candidates = [...products]
    .filter(([f]) => faces.has(f))
    .map(([f, p]) => ({ t: f / fps, size: area(p) / (width * height) }))
    .filter((c) => c.t < duration);
  if (!candidates.length) return [];
  const largest = Math.max(...candidates.map((c) => c.size));
  const scored = candidates.map((c) => {
    const moving = motion[Math.min(motion.length - 1, Math.floor(c.t / MOTION_STEP_S))] ?? 0;
    const fromCut = shots.reduce((nearest, s) => Math.min(nearest, Math.abs(s - c.t)), Infinity);
    const score = 0.5 * (c.size / largest) + 0.3 * (1 - moving) + 0.2 * Math.min(1, fromCut);
    return { ...c, moving, fromCut, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picks: typeof scored = [];
  for (const c of scored) {
    if (picks.every((p) => Math.abs(p.t - c.t) >= COVER_GAP_S)) picks.push(c);
    if (picks.length === 3) break;
  }
  return picks.map((c) => ({
    t: round(c.t, 3),
    score: round(c.score, 2),
    why: `Face and product both in frame. Product box is ${(c.size * 100).toFixed(1)}% of the frame. ${c.moving < 0.25 ? "Little movement" : "Some movement"}${Number.isFinite(c.fromCut) ? `, ${c.fromCut.toFixed(1)}s from a cut` : ""}.`,
  }));
}

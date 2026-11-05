import { type Box, CLEAR_OF_UI, type FixOverlay, inSpan, type Moment, MOTION_STEP_S } from "@/lib/details";
import type { Check, Report, TranscriptSegment } from "@/lib/report";
import type { BodyFrame, SceneData, TrackFrame } from "@/lib/scene";

// Everything the Studio works out from SceneData, with no canvas or DOM in it: where the body and the tracked boxes are
// at any moment, the reframe camera, and where markers go.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerpBox = (a: Box, b: Box, u: number) => a.map((v, i) => lerp(v, b[i], u)) as Box;

/** The Premiere markers export runs at 30 fps too. */
export const EDIT_FPS = 30;

/** mm:ss:ff, for the transport and the playhead flag, where a tenth of a second is too coarse. */
export function frameTimecode(t: number): string {
  const frames = Math.round(Math.max(0, t) * EDIT_FPS);
  const seconds = Math.floor(frames / EDIT_FPS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(frames % EDIT_FPS)}`;
}

/** Index of the last frame at or before t, or -1. */
export function frameBefore(frames: { t: number }[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Which shot t is in: the number of cuts at or before it. */
export function shotOf(shots: number[], t: number): number {
  const at = t + 1e-3;
  let lo = 0;
  let hi = shots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (shots[mid] <= at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const inStretches = (stretches: { t_start: number; t_end: number }[], t: number) => stretches.some((s) => inSpan(s, t));

/** The usual spacing of a track, so a thinned one still interpolates. */
function typicalStep(frames: { t: number }[], fallback: number): number {
  const steps: number[] = [];
  for (let i = 1; i < frames.length; i++) if (frames[i].t > frames[i - 1].t) steps.push(frames[i].t - frames[i - 1].t);
  if (!steps.length) return fallback;
  steps.sort((a, b) => a - b);
  return steps[steps.length >> 1];
}

/**
 * The two frames either side of t that may be blended. Both have to be in t's own shot and closer together than maxGap.
 * With only one usable it holds, for hold seconds. Past that there is nothing to draw, which is what a gap means.
 */
function bracket<T extends { t: number }>(frames: T[], t: number, shots: number[], maxGap: number, hold: number): { a: T; b: T; u: number } | null {
  const i = frameBefore(frames, t);
  const shot = shotOf(shots, t);
  const a = i >= 0 && shotOf(shots, frames[i].t) === shot ? frames[i] : null;
  const b = i + 1 < frames.length && shotOf(shots, frames[i + 1].t) === shot ? frames[i + 1] : null;
  if (a && b && b.t - a.t <= maxGap) return { a, b, u: (t - a.t) / (b.t - a.t || 1) };
  if (a && t - a.t <= hold) return { a, b: a, u: 0 };
  if (b && b.t - t <= hold) return { a: b, b, u: 0 };
  return null;
}

const OUTLINE_SHIFT_REACH = 8;

/**
 * Each outline starts at its own topmost point, and that point can hop from the head to a raised hand between frames.
 * This is how far b's points are turned so they line up with a's, so a blend moves the outline instead of spinning it.
 */
export function outlineShift(a: number[], b: number[]): number {
  const n = a.length / 2;
  let best = 0;
  let bestCost = Infinity;
  for (let s = -OUTLINE_SHIFT_REACH; s <= OUTLINE_SHIFT_REACH; s++) {
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + s + n) % n;
      const dx = a[i * 2] - b[j * 2];
      const dy = a[i * 2 + 1] - b[j * 2 + 1];
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return best;
}

/** Each box over a centred window of 5 frames, stopping at a cut or a gap, so tracking jitter doesn't shake the marks. */
export function smoothTrack(frames: TrackFrame[], shots: number[], step: number, radius = 2): TrackFrame[] {
  const linked = (a: TrackFrame, b: TrackFrame) => shotOf(shots, a.t) === shotOf(shots, b.t) && b.t - a.t <= 3 * step;
  return frames.map((frame, i) => {
    const window = [frame.box];
    for (let j = i - 1; j >= Math.max(0, i - radius) && linked(frames[j], frames[j + 1]); j--) window.push(frames[j].box);
    for (let j = i + 1; j <= Math.min(frames.length - 1, i + radius) && linked(frames[j - 1], frames[j]); j++) window.push(frames[j].box);
    return { ...frame, box: frame.box.map((_, k) => window.reduce((sum, box) => sum + box[k], 0) / window.length) as Box };
  });
}

export interface HandFrame {
  t: number;
  boxes: Box[];
}

export interface SceneIndex {
  scene: SceneData;
  bodyStep: number;
  /** For each body frame, the turn that lines the next frame's outline up with it. */
  shifts: Int8Array;
  trackStep: number;
  face: TrackFrame[];
  product: TrackFrame[];
  logo: TrackFrame[];
  hands: HandFrame[];
}

export function indexScene(scene: SceneData): SceneIndex {
  const samStep = 1 / (scene.fps || 15);
  const trackStep = typicalStep(scene.tracks.product.length ? scene.tracks.product : scene.tracks.face, samStep);
  const shifts = new Int8Array(scene.body.length);
  for (let i = 0; i + 1 < scene.body.length; i++) shifts[i] = outlineShift(scene.body[i].outline, scene.body[i + 1].outline);
  const hands: HandFrame[] = [];
  for (const f of scene.tracks.hand) {
    const last = hands[hands.length - 1];
    if (last && last.t === f.t) last.boxes.push(f.box);
    else hands.push({ t: f.t, boxes: [f.box] });
  }
  return {
    scene,
    bodyStep: typicalStep(scene.body, 2 * samStep),
    shifts,
    trackStep,
    face: smoothTrack(scene.tracks.face, scene.shots, trackStep),
    product: smoothTrack(scene.tracks.product, scene.shots, trackStep),
    logo: smoothTrack(scene.tracks.logo, scene.shots, trackStep),
    hands,
  };
}

export interface BodyNow {
  box: Box;
  share: number;
  outline: number[];
  spine: number[] | null;
}

function blendBody(a: BodyFrame, b: BodyFrame, u: number, shift: number): BodyNow {
  const n = a.outline.length / 2;
  const outline = new Array<number>(a.outline.length);
  for (let i = 0; i < n; i++) {
    const j = (i + shift + n) % n;
    outline[i * 2] = lerp(a.outline[i * 2], b.outline[j * 2], u);
    outline[i * 2 + 1] = lerp(a.outline[i * 2 + 1], b.outline[j * 2 + 1], u);
  }
  // A frame with no face has no spine, so the blend can only begin once both ends have one.
  const spine = a.spine && b.spine ? a.spine.map((v, i) => lerp(v, b.spine![i], u)) : u < 0.5 ? a.spine : b.spine;
  return { box: lerpBox(a.box, b.box, u), share: lerp(a.share, b.share, u), outline, spine };
}

/** The body at t, blended between its two nearest frames, never across a cut or a gap. */
export function bodyAt(ix: SceneIndex, t: number): BodyNow | null {
  const { body, shots } = ix.scene;
  const pair = bracket(body, t, shots, 2 * ix.bodyStep, ix.bodyStep);
  if (!pair) return null;
  if (pair.a === pair.b) return { box: pair.a.box, share: pair.a.share, outline: pair.a.outline, spine: pair.a.spine };
  return blendBody(pair.a, pair.b, pair.u, ix.shifts[frameBefore(body, pair.a.t)]);
}

/** A tracked box at t, under the same rules. */
export function trackAt(frames: TrackFrame[], t: number, shots: number[], step: number): Box | null {
  const pair = bracket(frames, t, shots, 3 * step, 1.5 * step);
  return pair && (pair.a === pair.b ? pair.a.box : lerpBox(pair.a.box, pair.b.box, pair.u));
}

/** Up to two hands: each box of the earlier frame blends with the nearest box of the later one. */
export function handsAt(ix: SceneIndex, t: number): Box[] {
  const pair = bracket(ix.hands, t, ix.scene.shots, 3 * ix.trackStep, 1.5 * ix.trackStep);
  if (!pair) return [];
  if (pair.a === pair.b) return pair.a.boxes;
  const centre = (b: Box) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
  return pair.a.boxes.map((box) => {
    const [cx, cy] = centre(box);
    let near = pair.b.boxes[0];
    let best = Infinity;
    for (const other of pair.b.boxes) {
      const [ox, oy] = centre(other);
      const d = Math.hypot(cx - ox, cy - oy);
      if (d < best) {
        best = d;
        near = other;
      }
    }
    return best < 0.2 ? lerpBox(box, near, pair.u) : box;
  });
}

/**
 * Bezier segments through points [x, y, ...] on a uniform Catmull-Rom spline, as [c1x, c1y, c2x, c2y, x, y, ...]. The
 * curve starts at the first point, so draw it with moveTo(points[0], points[1]) and a bezierCurveTo per six numbers.
 */
export function catmullRom(points: number[], closed: boolean): number[] {
  const n = points.length / 2;
  const out: number[] = [];
  const at = (i: number) => {
    const k = closed ? (i + n) % n : clamp(i, 0, n - 1);
    return [points[k * 2], points[k * 2 + 1]];
  };
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    out.push(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
  }
  return out;
}

// The reframe camera

export type ReframeAspect = "1:1" | "4:5";
const ASPECT: Record<ReframeAspect, number> = { "1:1": 1, "4:5": 4 / 5 };
export const aspectValue = (aspect: ReframeAspect) => ASPECT[aspect];

/** The largest crop of that shape in the frame, as fractions of the frame. */
export function cropSize(aspect: number, frameWidth: number, frameHeight: number): { w: number; h: number } {
  const frame = frameWidth / frameHeight;
  return aspect < frame ? { w: aspect / frame, h: 1 } : { w: 1, h: frame / aspect };
}

const CAMERA_HZ = 30;
/** Stiffness of the camera's spring. A critically damped spring settles in about 5 / this seconds. */
const CAMERA_OMEGA = 6;

export interface CameraPath {
  /** Top-left of the crop, in fractions of the frame, CAMERA_HZ samples a second. */
  x: Float32Array;
  y: Float32Array;
  w: number;
  h: number;
}

/**
 * One step of a critically damped spring, the exact solution and not an integration, so it can't overshoot or blow up.
 */
export function springStep(x: number, v: number, target: number, omega: number, dt: number): [x: number, v: number] {
  const off = x - target;
  const kick = (v + omega * off) * dt;
  const decay = Math.exp(-omega * dt);
  return [target + (off + kick) * decay, (v - omega * kick) * decay];
}

/**
 * The camera's path over the whole Reel, worked out once so seeking lands on the same framing as playing. It follows the
 * body's centre, or with a face in frame puts the face on the upper third so nobody loses their head. It cuts when the
 * Reel cuts, and with nothing to follow it stays where it was.
 */
export function buildCamera(ix: SceneIndex, aspect: number): CameraPath {
  const { scene } = ix;
  const { w, h } = cropSize(aspect, scene.width, scene.height);
  const count = Math.max(1, Math.ceil(scene.duration_s * CAMERA_HZ) + 1);
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const dt = 1 / CAMERA_HZ;
  let targetX = 0.5;
  let targetY = 0.5;
  const aim = (t: number) => {
    const face = trackAt(ix.face, t, scene.shots, ix.trackStep);
    const body = bodyAt(ix, t);
    if (face) {
      targetX = face[0] + face[2] / 2;
      targetY = face[1] + face[3] / 2 + h / 6;
    } else if (body) {
      targetX = body.box[0] + body.box[2] / 2;
      targetY = body.box[1] + body.box[3] / 2;
    }
  };
  aim(0);
  let x = targetX;
  let y = targetY;
  let vx = 0;
  let vy = 0;
  let shot = 0;
  for (let i = 0; i < count; i++) {
    const t = i * dt;
    aim(t);
    const nowShot = shotOf(scene.shots, t);
    if (nowShot !== shot) {
      shot = nowShot;
      x = targetX;
      y = targetY;
      vx = 0;
      vy = 0;
    } else {
      [x, vx] = springStep(x, vx, targetX, CAMERA_OMEGA, dt);
      [y, vy] = springStep(y, vy, targetY, CAMERA_OMEGA, dt);
    }
    xs[i] = clamp(x - w / 2, 0, 1 - w);
    ys[i] = clamp(y - h / 2, 0, 1 - h);
  }
  return { x: xs, y: ys, w, h };
}

export function cameraAt(path: CameraPath, t: number): Box {
  const at = clamp(t * CAMERA_HZ, 0, path.x.length - 1);
  const i = Math.floor(at);
  const j = Math.min(path.x.length - 1, i + 1);
  // No blend across a cut: a jump of more than a sliver between samples is the camera cutting.
  const jumps = Math.abs(path.y[j] - path.y[i]) > 0.05 || Math.abs(path.x[j] - path.x[i]) > 0.05;
  const u = jumps ? 0 : at - i;
  return [lerp(path.x[i], path.x[j], u), lerp(path.y[i], path.y[j], u), path.w, path.h];
}

// Logo marks

/**
 * Where a missing logo should go: the top right of what Instagram leaves clear. The disclosure label's place is the top
 * left, and nothing else of Instagram's sits here.
 */
export const SAFE_CORNER: Box = [CLEAR_OF_UI.x1 - 0.02 - 0.36, CLEAR_OF_UI.y0 + 0.015, 0.36, 0.05];

/**
 * The brand's logo where it could sit: beside the product and moving with it when the product is on screen, else in the
 * safe corner. Always inside the part of the frame Instagram leaves clear. logoAspect is the image's width over height.
 */
export function ghostLogoBox(product: Box | null, logoAspect: number, frameWidth: number, frameHeight: number): Box {
  const h = 0.05;
  const w = Math.min(0.3, h * logoAspect * (frameHeight / frameWidth));
  const gap = 0.025;
  const { x0, y0, x1, y1 } = CLEAR_OF_UI;
  if (!product) return [SAFE_CORNER[0] + SAFE_CORNER[2] - w, SAFE_CORNER[1], w, h];
  const [px, py, pw, ph] = product;
  const right = px + pw + gap;
  const x = right + w <= x1 - 0.01 ? right : px - gap - w;
  return [clamp(x, x0 + 0.01, x1 - 0.01 - w), clamp(py + ph / 2 - h / 2, y0 + 0.01, y1 - 0.01 - h), w, h];
}

// Timeline

/**
 * Centres for markers at these times, in time order, kept minGap apart so numbers stay readable at low zoom, inside the
 * track at the left, and pulled back from the right edge if they pile up there.
 */
export function placeMarkers(times: number[], pps: number, minGap: number, width: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const want = Math.max(times[i] * pps, minGap / 2);
    xs.push(i && xs[i - 1] + minGap > want ? xs[i - 1] + minGap : want);
  }
  for (let i = xs.length - 1; i >= 0; i--) {
    const limit = (i === xs.length - 1 ? width : xs[i + 1]) - (i === xs.length - 1 ? 0 : minGap);
    if (xs[i] > limit) xs[i] = limit;
  }
  return xs;
}

/** The scroll position that keeps the same moment under anchorX after a zoom. */
export const zoomedScroll = (scrollLeft: number, anchorX: number, fromPps: number, toPps: number) => Math.max(0, ((scrollLeft + anchorX) / fromPps) * toPps - anchorX);

/** Sorted unique times, for jumping between marks with comma and period. */
export function stopsFrom(times: number[]): number[] {
  return [...new Set(times.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
}

export function nextStop(stops: number[], t: number, direction: 1 | -1): number | null {
  const near = 0.04;
  if (direction > 0) return stops.find((s) => s > t + near) ?? null;
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i] < t - near) return stops[i];
  return null;
}

/** The hold ASCI needs, laid from the start of the longest stretch the label held, or from 0 with no label at all. */
export function holdBracket(spans: { t_start: number; t_end: number }[], needed: number, duration: number) {
  const longest = spans.reduce<{ t_start: number; t_end: number } | null>((best, s) => (!best || s.t_end - s.t_start > best.t_end - best.t_start ? s : best), null);
  const start = longest?.t_start ?? 0;
  const held = longest ? longest.t_end - longest.t_start : 0;
  return { t_start: start, t_end: Math.min(duration, start + needed), held, met: held >= needed };
}

// Words in the transcript

const SKIP_WORDS = new Set(["the", "and", "for", "with", "pro", "new", "gen", "plus", "max", "mini", "from", "your"]);

/** The brand's name, each product's full name, and the telling words of those names, longest first. */
export function brandWords(brand: string, products: string[]): string[] {
  const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
  const words = new Set<string>();
  for (const name of [brand, ...products].map(clean)) {
    if (!name) continue;
    words.add(name);
    for (const word of name.split(" ")) if (word.length >= 3 && !SKIP_WORDS.has(word) && !/^\d+$/.test(word)) words.add(word);
  }
  return [...words].sort((a, b) => b.length - a.length);
}

export interface BrandMention {
  /** Where in the segment the word falls, by its place in the text: an estimate. */
  t: number;
  t_start: number;
  t_end: number;
  word: string;
}

/** Each time the brand or a product is said. Case doesn't matter and hyphens read as spaces, so "Ray-Ban" finds "ray ban". */
export function brandMentions(transcript: TranscriptSegment[], words: string[]): BrandMention[] {
  if (!words.length) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{M}\\p{N}])`, "gu");
  const out: BrandMention[] = [];
  for (const segment of transcript) {
    const text = segment.text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, " ");
    // Words of one name said in a row ("ray ban meta") are one mention, however the kit lists them.
    const runs: [start: number, end: number][] = [];
    for (const match of text.matchAll(pattern)) {
      const last = runs[runs.length - 1];
      if (last && match.index - last[1] <= 1) last[1] = match.index + match[0].length;
      else runs.push([match.index, match.index + match[0].length]);
    }
    for (const [start, end] of runs) {
      out.push({ t: lerp(segment.t_start, segment.t_end, (start + end) / 2 / (text.length || 1)), t_start: segment.t_start, t_end: segment.t_end, word: text.slice(start, end) });
    }
  }
  return out;
}

// The readout at the playhead

/** The clause that applies now: a check with evidence here, worst first, else the rule on how long the label must hold. */
export function clauseAt(report: Report, t: number): { code: string; note: string; here: boolean } | null {
  const worst = (c: Check) => (c.verdict === "FAIL" ? 0 : c.verdict === "REVIEW" ? 1 : c.verdict === "PASS" ? 2 : 3);
  const here = [...report.checks].filter((c) => c.clause && c.evidence.some((e) => t >= e.t_start && t <= e.t_end)).sort((a, b) => worst(a) - worst(b))[0];
  if (here?.clause) return { code: here.clause.code, note: here.title, here: true };
  const rule = report.checks.find((c) => c.id === "label_duration" && c.clause) ?? report.checks.find((c) => c.clause);
  return rule?.clause ? { code: rule.clause.code, note: rule.title, here: false } : null;
}

export interface Readout {
  shot: number | null;
  shots: number | null;
  creator: boolean | null;
  productShare: number | null;
  logoSeen: boolean | null;
  motion: number | null;
  labelOn: boolean;
  clause: ReturnType<typeof clauseAt>;
}

export function readoutAt(ix: SceneIndex | null, report: Report, t: number): Readout {
  const labelOn = report.tracks.some((track) => track.kind === "disclosure_label" && inStretches(track.spans, t));
  const clause = clauseAt(report, t);
  if (!ix) return { shot: null, shots: null, creator: null, productShare: null, logoSeen: null, motion: null, labelOn, clause };
  const { scene } = ix;
  const product = trackAt(ix.product, t, scene.shots, ix.trackStep);
  return {
    shot: shotOf(scene.shots, t) + 1,
    shots: scene.shots.length + 1,
    creator: inStretches(scene.lanes.creator, t),
    productShare: product ? product[2] * product[3] : 0,
    logoSeen: inStretches(scene.lanes.logo, t),
    motion: scene.motion[Math.min(scene.motion.length - 1, Math.floor(t / MOTION_STEP_S))] ?? 0,
    labelOn,
    clause,
  };
}

export const motionWord = (m: number) => (m < 0.15 ? "Still" : m < 0.4 ? "Some" : m < 0.75 ? "Moving" : "Fast");

/** The fixes showing at t, with the selected moment's on top. */
export function fixesAt(moments: Moment[], t: number, selected: string | null): { id: string; fix: FixOverlay }[] {
  return moments
    .flatMap((m) => (m.fix && m.fix.spans.some((s) => inSpan(s, t)) ? [{ id: m.id, fix: m.fix }] : []))
    .sort((a, b) => Number(a.id === selected) - Number(b.id === selected));
}


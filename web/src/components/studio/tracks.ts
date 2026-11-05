import { formatHold } from "@/lib/asci";
import { formatSeconds, formatTimecode } from "@/lib/format";
import type { TranscriptSegment } from "@/lib/report";
import type { SceneData, Stretch } from "@/lib/scene";
import { type BrandMention, clamp, holdBracket, shotOf } from "./geometry";

// The timeline's dense rows, each drawn on its own canvas for the part of the Reel in view. They only redraw when the
// view or the data changes; the playhead is a separate element, so playing doesn't touch them.

export interface TrackView {
  /** Time at the canvas's left edge. */
  t0: number;
  pps: number;
  width: number;
  height: number;
  duration: number;
  mono: string;
  dpr: number;
}

const x = (t: number, v: TrackView) => (t - v.t0) * v.pps;

function bands(ctx: CanvasRenderingContext2D, v: TrackView, stretches: Stretch[], color: string, top = 2, bottom = 2) {
  ctx.fillStyle = color;
  for (const s of stretches) {
    const a = x(s.t_start, v);
    const b = x(s.t_end, v);
    if (b < 0 || a > v.width) continue;
    ctx.fillRect(a, top, Math.max(1, b - a), v.height - top - bottom);
  }
}

/** Diagonal lines over a stretch, so a gap reads as measured and missing rather than merely empty. */
function hatched(ctx: CanvasRenderingContext2D, v: TrackView, stretches: Stretch[], color: string, wash: string) {
  for (const s of stretches) {
    const a = Math.max(0, x(s.t_start, v));
    const b = Math.min(v.width, x(s.t_end, v));
    if (b <= a) continue;
    ctx.fillStyle = wash;
    ctx.fillRect(a, 1, b - a, v.height - 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a, 1, b - a, v.height - 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gap = 5;
    // From the Reel's start, so the lines stay put while the view scrolls.
    const origin = x(0, v);
    const first = origin + Math.floor((a - v.height - origin) / gap) * gap;
    for (let px = first; px < b; px += gap) {
      ctx.moveTo(px, v.height);
      ctx.lineTo(px + v.height, 0);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** A nothing-to-show row: faint, so the track's shape is there before its data is. */
export function drawWaiting(ctx: CanvasRenderingContext2D, v: TrackView) {
  ctx.fillStyle = "rgba(255,255,255,0.025)";
  ctx.fillRect(0, 1, v.width, v.height - 2);
}

export function drawRuler(ctx: CanvasRenderingContext2D, v: TrackView) {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const step = steps.find((s) => s * v.pps >= 64) ?? 60;
  const minor = step / (step === 15 || step === 30 ? 3 : step === 0.2 || step === 2 ? 4 : 5);
  ctx.font = `500 10px ${v.mono}`;
  ctx.textBaseline = "top";
  const end = Math.min(v.duration, v.t0 + v.width / v.pps);
  ctx.fillStyle = "#4a4845";
  for (let i = Math.floor(v.t0 / minor); i * minor <= end; i++) ctx.fillRect(Math.round(x(i * minor, v)), v.height - 4, 1, 4);
  for (let i = Math.floor(v.t0 / step); i * step <= end; i++) {
    const t = i * step;
    const px = Math.round(x(t, v));
    ctx.fillStyle = "#6f6d67";
    ctx.fillRect(px, v.height - 9, 1, 9);
    ctx.fillStyle = "#9a978f";
    ctx.fillText(formatTimecode(t), px + 4, 3);
  }
}

export function drawFilmstrip(ctx: CanvasRenderingContext2D, v: TrackView, image: HTMLImageElement, sprite: SceneData["sprite"]) {
  const tileW = v.height * (sprite.tile_w / sprite.tile_h);
  const tiles = sprite.cols * sprite.rows;
  const offset = -(((v.t0 * v.pps) % tileW) + tileW) % tileW;
  for (let px = offset; px < v.width; px += tileW) {
    const t = v.t0 + (px + tileW / 2) / v.pps;
    if (t < 0 || t - tileW / 2 / v.pps > v.duration) continue;
    const tile = clamp(Math.floor(t / sprite.every_s), 0, tiles - 1);
    const col = tile % sprite.cols;
    const row = Math.floor(tile / sprite.cols);
    ctx.drawImage(image, col * sprite.tile_w, row * sprite.tile_h, sprite.tile_w, sprite.tile_h, px, 0, tileW + 0.5, v.height);
  }
  // Past the end of the Reel.
  const end = x(v.duration, v);
  if (end < v.width) ctx.clearRect(end, 0, v.width - end, v.height);
}

export function drawShots(ctx: CanvasRenderingContext2D, v: TrackView, shots: number[]) {
  const edges = [0, ...shots, v.duration];
  ctx.font = `500 9px ${v.mono}`;
  ctx.textBaseline = "middle";
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = x(edges[i], v);
    const b = x(edges[i + 1], v);
    if (b < 0 || a > v.width) continue;
    ctx.fillStyle = i % 2 ? "#232321" : "#2d2d2a";
    ctx.fillRect(a, 1, b - a, v.height - 2);
    if (b - a > 16) {
      ctx.fillStyle = "#9a978f";
      ctx.fillText(String(i + 1), Math.max(a, 0) + 4, v.height / 2 + 0.5);
    }
  }
  ctx.fillStyle = "#f3f1ea";
  for (const cut of shots) ctx.fillRect(Math.round(x(cut, v)), 0, 1, v.height);
}

export function drawLabel(ctx: CanvasRenderingContext2D, v: TrackView, spans: Stretch[], needed: number) {
  const hold = holdBracket(spans, needed, v.duration);
  const a = x(hold.t_start, v);
  const b = x(hold.t_end, v);
  bands(ctx, v, spans, "#7fe0c3", 2, 7);
  // The bracket: the hold ASCI needs, laid from where the longest stretch starts, and what's short of it hatched.
  const color = hold.met ? "#7fe0c3" : "#f2bd45";
  if (!hold.met) hatched(ctx, { ...v, height: v.height - 5 }, [{ t_start: hold.t_start + hold.held, t_end: hold.t_end }], "rgba(255,61,82,0.5)", "rgba(255,61,82,0.08)");
  ctx.fillStyle = color;
  const y = v.height - 4;
  ctx.fillRect(a, y, Math.max(1, b - a), 1);
  ctx.fillRect(a, y - 3, 1, 4);
  ctx.fillRect(b - 1, y - 3, 1, 4);
  ctx.font = `500 9px ${v.mono}`;
  ctx.textBaseline = "middle";
  const text = `Needs ${formatHold(needed)}, held ${formatSeconds(hold.held)}`;
  const width = ctx.measureText(text).width;
  // After what's held, in the part of the bracket still empty; past the bracket if that won't fit.
  const inside = Math.max(0, x(hold.t_start + hold.held, v)) + 4;
  if (b <= 0) return;
  ctx.fillStyle = color;
  ctx.fillText(text, b - inside > width + 4 ? inside : b + 4, y / 2 + 0.5);
}

export function drawProduct(ctx: CanvasRenderingContext2D, v: TrackView, lanes: SceneData["lanes"]) {
  bands(ctx, v, lanes.product, "#b4481c");
  bands(ctx, v, lanes.productInHand, "#ffb08e", 4, 4);
}

export function drawLogo(ctx: CanvasRenderingContext2D, v: TrackView, lanes: SceneData["lanes"]) {
  hatched(ctx, v, lanes.logoMissing, "rgba(255,61,82,0.85)", "rgba(255,61,82,0.14)");
  bands(ctx, v, lanes.logo, "#d9d5ca");
}

export function drawLane(ctx: CanvasRenderingContext2D, v: TrackView, lane: Stretch[], color: string) {
  bands(ctx, v, lane, color);
}

export function drawMotion(ctx: CanvasRenderingContext2D, v: TrackView, motion: number[], step: number) {
  const base = v.height - 1;
  const top = base - 2;
  const first = Math.max(0, Math.floor(v.t0 / step) - 1);
  const last = Math.min(motion.length - 1, Math.ceil((v.t0 + v.width / v.pps) / step) + 1);
  if (last < first) return;
  const line = new Path2D();
  for (let i = first; i <= last; i++) {
    const px = x((i + 0.5) * step, v);
    const py = base - motion[i] * top;
    if (i === first) line.moveTo(px, py);
    else line.lineTo(px, py);
  }
  const area = new Path2D(line);
  area.lineTo(x((last + 0.5) * step, v), base);
  area.lineTo(x((first + 0.5) * step, v), base);
  area.closePath();
  ctx.fillStyle = "rgba(200,182,255,0.26)";
  ctx.fill(area);
  ctx.strokeStyle = "#c8b6ff";
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.stroke(line);
}

const WAVE_STEP_S = 0.1;

export function drawAudio(ctx: CanvasRenderingContext2D, v: TrackView, waveform: number[]) {
  const mid = v.height / 2;
  const reach = mid - 1;
  ctx.fillStyle = "#5fbf9f";
  // One bar per device pixel at most, each the loudest peak under it.
  const barPx = Math.max(1, Math.round(v.pps * WAVE_STEP_S));
  const end = Math.min(v.width, x(v.duration, v));
  for (let px = Math.max(0, x(0, v)); px < end; px += barPx) {
    const from = Math.floor((v.t0 + px / v.pps) / WAVE_STEP_S);
    const to = Math.max(from + 1, Math.floor((v.t0 + (px + barPx) / v.pps) / WAVE_STEP_S));
    let peak = 0;
    for (let i = from; i < to && i < waveform.length; i++) peak = Math.max(peak, waveform[i] ?? 0);
    const h = Math.max(0.5, (peak / 255) * reach);
    ctx.fillRect(px, mid - h, Math.max(1, barPx - (barPx > 2 ? 1 : 0)), h * 2);
  }
}

export function drawSpeech(ctx: CanvasRenderingContext2D, v: TrackView, transcript: TranscriptSegment[], mentions: BrandMention[]) {
  ctx.font = `400 10px ${v.mono}`;
  ctx.textBaseline = "middle";
  for (const s of transcript) {
    const a = x(s.t_start, v);
    const b = x(s.t_end, v);
    if (b < 0 || a > v.width) continue;
    ctx.fillStyle = "#2c3e40";
    ctx.beginPath();
    ctx.roundRect(a, 2, Math.max(2, b - a - 1), v.height - 4, 2);
    ctx.fill();
    if (b - a > 34) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(a + 4, 0, b - a - 8, v.height);
      ctx.clip();
      ctx.fillStyle = "#c6e4e7";
      ctx.fillText(s.text, Math.max(a + 4, Math.min(4, b - 60)), v.height / 2 + 0.5);
      ctx.restore();
    }
  }
  ctx.fillStyle = "#ff6a2b";
  for (const m of mentions) {
    const px = x(m.t, v);
    if (px < -4 || px > v.width + 4) continue;
    ctx.beginPath();
    ctx.moveTo(px, 1);
    ctx.lineTo(px + 3.5, 4.5);
    ctx.lineTo(px, 8);
    ctx.lineTo(px - 3.5, 4.5);
    ctx.closePath();
    ctx.fill();
  }
}

/** Under the cursor: which shot, and what's being said. */
export function describeTime(t: number, scene: SceneData | null, transcript: TranscriptSegment[]): string {
  const said = transcript.find((s) => t >= s.t_start && t < s.t_end)?.text;
  const shot = scene ? `Shot ${shotOf(scene.shots, t) + 1}` : "";
  return [shot, said ? `"${said}"` : ""].filter(Boolean).join("  ");
}

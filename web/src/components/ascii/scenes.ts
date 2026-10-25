import { SAMPLE_REPORT } from "@/lib/mock";
import { TONE, type AsciiFrame, type AsciiScene } from "./ascii-canvas";

// Procedural scenes for the landing page. Every scene writes a 0..1 level and a tone per cell.
// The reel scenes use the sample report's own timings, so the picture matches the evidence.

export const STORY_DURATION = SAMPLE_REPORT.video.duration_s;
const BRAND_SPANS = SAMPLE_REPORT.tracks.filter((t) => t.kind === "brand").flatMap((t) => t.spans);
const LABEL_SPANS = SAMPLE_REPORT.tracks.filter((t) => t.kind === "disclosure_label").flatMap((t) => t.spans);
const SPEECH = SAMPLE_REPORT.transcript;
export const SPOKEN_AT = SAMPLE_REPORT.checks
  .filter((c) => c.id === "spoken_disclosure")
  .flatMap((c) => c.evidence)
  .find((e) => e.kind === "audio");

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;

function hash(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const isLabelVisible = (s: number) => LABEL_SPANS.some((span) => s >= span.t_start && s <= span.t_end);
export const isTalking = (s: number) => SPEECH.some((seg) => s >= seg.t_start && s <= seg.t_end);

/** Vertical slide of the product (plate units), or null when it is off screen. */
export function productOffset(s: number): number | null {
  for (const span of BRAND_SPANS) {
    if (s >= span.t_start - 0.5 && s <= span.t_end + 0.4) {
      if (s < span.t_start) return (1 - easeOut((s - (span.t_start - 0.5)) / 0.5)) * 7;
      if (s > span.t_end) return easeOut((s - span.t_end) / 0.4) * 7;
      return 0;
    }
  }
  return null;
}

// Plate geometry, in units of a 9 x 16 frame. A close Reel framing: big head, product low right.
const PRODUCT = { x: 7.15, y: 12.3, hw: 0.66, hh: 1.4 };
const HEAD = { x: 4.4, y: 6.5, r: 2.25 };

/** The product's on-screen box as fractions of the plate, for the tracking bracket. */
export function productBox(s: number) {
  const off = productOffset(s);
  if (off === null) return null;
  const top = PRODUCT.y - PRODUCT.hh - 0.95 + off;
  const bottom = PRODUCT.y + PRODUCT.hh + 0.75 + off;
  return {
    left: (PRODUCT.x - PRODUCT.hw - 0.45) / 9,
    right: (PRODUCT.x + PRODUCT.hw + 0.45) / 9,
    top: top / 16,
    bottom: Math.min(bottom, 16) / 16,
  };
}

const LIGHT = (() => {
  const v = [-0.28, -0.42, 0.86];
  const m = Math.hypot(v[0], v[1], v[2]);
  return v.map((n) => n / m);
})();

function sphereShade(dx: number, dy: number, r: number) {
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
}

function inRoundRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

/**
 * The creator Reel: light glyphs on the ink plate. `t` is story time in seconds (0..28).
 * Head, hair, a talking mouth, and the product sliding in for each brand span.
 */
export const reelScene: AsciiScene = (frame: AsciiFrame) => {
  const { cols, rows, t: s, level, tone } = frame;
  const grainFrame = Math.floor(s * 8);
  const bob = 0.1 * Math.sin((2 * Math.PI * s) / 3.1);
  const sway = 0.08 * Math.sin((2 * Math.PI * s) / 4.3);
  const hx = HEAD.x + sway;
  const hy = HEAD.y + bob;
  const fr = HEAD.r;
  const talk = isTalking(s) ? 0.5 + 0.5 * Math.sin(s * 19) : 0;
  const off = productOffset(s);
  const leakX = 7 + Math.sin(s * 0.3);

  for (let r = 0; r < rows; r++) {
    const y = ((r + 0.5) / rows) * 16;
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols) * 9;
      const i = r * cols + c;

      // Studio backdrop: mostly dark, a soft glow behind the creator and a drifting light leak.
      let b =
        0.02 +
        0.04 * (1 - y / 16) +
        0.09 * Math.exp(-((x - 4.5) ** 2 + (y - 6) ** 2) / 12) +
        0.08 * Math.exp(-((x - leakX) ** 2 + (y - 2.4) ** 2) / 5);
      let t: number = TONE.muted;

      // Torso, lit from the upper left
      const tdx = (x - hx) / 4.7;
      const tdy = (y - 15.9) / 5.1;
      if (tdx * tdx + tdy * tdy <= 1) {
        const fold = 0.04 * Math.sin(x * 3 + y * 1.3);
        b = 0.3 + 0.22 * clamp01(0.6 - (x - hx) * 0.16 - (y - 12) * 0.06) + fold;
        t = TONE.fg;
      }
      // Neck
      if (Math.abs(x - hx) < 0.78 && y > hy + 1.6 && y < hy + 4.6) {
        b = 0.46 + 0.14 * clamp01(0.5 - (x - hx));
        if (y < hy + 2.6) b -= 0.12; // shadow under the chin
        t = TONE.fg;
      }
      // Hair behind the head, falling to the shoulders: darker than the face, still visible
      const hairDx = x - hx;
      const inHairBack =
        hairDx * hairDx + (y - (hy - 0.45)) ** 2 <= (fr + 0.5) ** 2 ||
        (Math.abs(hairDx) > fr - 0.75 && Math.abs(hairDx) < fr + 0.55 && y > hy && y < hy + 4.4);
      if (inHairBack) {
        b = 0.18 + 0.05 * Math.sin(x * 9) + 0.08 * sphereShade(hairDx, y - hy, fr + 0.5);
        t = TONE.muted;
      }
      // Face: frontal light, bright in the middle, softer at the edge
      const fdx = x - hx;
      const fdy = (y - hy) * 0.94;
      if (fdx * fdx + fdy * fdy <= fr * fr) {
        b = 0.42 + 0.56 * sphereShade(fdx, fdy, fr);
        t = TONE.fg;
        // Fringe
        if (fdy < -0.95 - 0.28 * Math.sin(fdx * 2.3)) {
          b = 0.2 + 0.06 * Math.sin(x * 11);
          t = TONE.muted;
        }
        // Eyes, with a bright catchlight, and brows
        for (const ex of [-0.85, 0.85]) {
          const edx = (fdx - ex) / 0.36;
          const edy = (fdy - 0.12) / 0.19;
          if (edx * edx + edy * edy <= 1) b = Math.abs(fdx - ex + 0.08) < 0.07 && fdy < 0.1 ? 0.7 : 0;
          if (Math.abs(fdx - ex) < 0.46 && Math.abs(fdy + 0.42 - 0.06 * Math.abs(fdx - ex)) < 0.08) b = 0.1;
        }
        // Nose shadow
        if (fdx > 0.06 && fdx < 0.2 && fdy > 0.25 && fdy < 0.95) b -= 0.22;
        // Mouth, opening while she talks
        const mdx = fdx / 0.52;
        const mdy = (fdy - 1.32) / (0.07 + 0.22 * talk);
        if (mdx * mdx + mdy * mdy <= 1) b = 0.04;
      }
      // Product in hand
      if (off !== null) {
        const py = PRODUCT.y + off;
        if (inRoundRect(x, y, PRODUCT.x, py - PRODUCT.hh - 0.32, 0.3, 0.3, 0.08)) {
          b = 0.5;
          t = TONE.fg;
        }
        if (inRoundRect(x, y, PRODUCT.x, py, PRODUCT.hw, PRODUCT.hh, 0.32)) {
          b = 0.95 - 0.25 * clamp01((x - PRODUCT.x + PRODUCT.hw) / (2 * PRODUCT.hw));
          if (y > py - 0.3 && y < py + 0.45) b = 0.42;
          t = TONE.fg;
        }
        const hdx = x - (PRODUCT.x - 0.3);
        const hdy = y - (py + 1.5);
        if (hdx * hdx + hdy * hdy <= 0.66 * 0.66) {
          b = 0.3 + 0.5 * sphereShade(hdx, hdy, 0.66);
          t = TONE.fg;
        }
      }

      // Reels header shade, and film grain so the frame never sits still.
      if (y < 2.6) b *= 0.55 + 0.45 * (y / 2.6);
      b += (hash(c, r, grainFrame) - 0.5) * 0.05;
      level[i] = clamp01(b);
      tone[i] = t;
    }
  }
};


/** Label hold as a bar: the held stretch dense, the rest of the video dotted, the playhead in signal. */
export const holdScene: AsciiScene = ({ cols, rows, t, level, tone }) => {
  const loop = 6.5;
  const s = Math.min(STORY_DURATION, ((t % loop) / (loop - 1)) * STORY_DURATION);
  const top = Math.floor(rows * 0.25);
  const bottom = Math.ceil(rows * 0.75);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const at = ((c + 0.5) / cols) * STORY_DURATION;
      const head = Math.abs(at - s) < STORY_DURATION / cols;
      if (r >= top && r < bottom) {
        const held = isLabelVisible(at);
        if (head) {
          level[i] = 1;
          tone[i] = TONE.signal;
        } else if (held && at <= s) {
          level[i] = 1;
          tone[i] = TONE.fg;
        } else if (at <= s) {
          level[i] = 0.34;
          tone[i] = TONE.muted;
        } else {
          level[i] = 0.34;
          tone[i] = TONE.faint;
        }
      } else if (r === bottom && Math.abs((at % 5) - 0) < STORY_DURATION / cols) {
        level[i] = 0.5;
        tone[i] = TONE.muted;
      } else if (head && r >= top - 1 && r <= bottom) {
        level[i] = 0.55;
        tone[i] = TONE.signal;
      }
    }
  }
};

/** Speech as an ASCII waveform; the spoken disclosure lights up in signal once the playhead reaches it. */
export const waveScene: AsciiScene = ({ cols, rows, t, level, tone }) => {
  const loop = 7;
  const s = Math.min(STORY_DURATION, ((t % loop) / (loop - 1)) * STORY_DURATION);
  const mid = (rows - 1) / 2;
  const start = SPOKEN_AT?.t_start ?? 21;
  const end = SPOKEN_AT?.t_end ?? 22.4;
  for (let c = 0; c < cols; c++) {
    const at = ((c + 0.5) / cols) * STORY_DURATION;
    const speaking = isTalking(at);
    const env = speaking ? 0.35 + 0.65 * valueNoise(c * 0.45, 3, 11) : 0.06 * valueNoise(c * 0.9, 1, 5);
    const amp = env * mid;
    const passed = at <= s;
    const disclosure = at >= start && at <= end;
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      const d = Math.abs(r - mid);
      if (d <= amp + 0.35) {
        level[i] = d < amp * 0.5 ? 1 : 0.65;
        tone[i] = disclosure && passed ? TONE.signal : passed ? TONE.fg : TONE.faint;
      } else if (Math.abs(at - s) < STORY_DURATION / cols) {
        level[i] = 0.4;
        tone[i] = TONE.signal;
      }
    }
  }
};

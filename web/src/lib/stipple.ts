import type { Delaunay as DelaunayClass } from "d3-delaunay";

// Weighted Voronoi stippling, after Adrian Secord (2002), with d3-delaunay by Mike Bostock (ISC). Dots start scattered,
// their targets relax toward the weighted centre of their Voronoi cells, and they settle into the logo's own pixels.
// The weights and the colours come from the logo itself, so a dot is never a colour the logo doesn't have.

export type Rgb = [number, number, number];

export const PLATES = { light: [251, 250, 246] as Rgb, dark: [18, 18, 18] as Rgb };

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * Which plate a logo shows on. A white logo on a transparent ground would vanish on paper, so it gets the dark plate. A
 * logo with its own solid ground brings its own contrast and stays on paper, however pale that ground is.
 */
export function plateFor(rgba: Uint8ClampedArray): "light" | "dark" {
  let seen = 0;
  let clear = 0;
  let light = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    if (a < 0.06) {
      clear += 1;
      continue;
    }
    seen += a;
    light += a * lum(rgba[i], rgba[i + 1], rgba[i + 2]);
  }
  const total = rgba.length / 4;
  return seen > 0 && clear / total > 0.1 && light / seen > 0.8 ? "dark" : "light";
}

/** How much ink each pixel holds on this plate: 0 for what can't be told from the plate, up to 1. */
export function weightsFor(rgba: Uint8ClampedArray, plate: Rgb): Float32Array {
  const weights = new Float32Array(rgba.length / 4);
  let max = 0;
  for (let i = 0; i < weights.length; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const distance = Math.hypot(rgba[i * 4] - plate[0], rgba[i * 4 + 1] - plate[1], rgba[i * 4 + 2] - plate[2]) / 441.7;
    const w = a * distance;
    weights[i] = w;
    if (w > max) max = w;
  }
  if (max > 0) for (let i = 0; i < weights.length; i++) weights[i] = weights[i] / max < 0.04 ? 0 : weights[i] / max;
  return weights;
}

/** A small seeded generator, so the same logo always settles the same way. mulberry32. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export class Stippler {
  readonly count: number;
  /** Where each dot is heading, relaxed once per relax(). */
  readonly targets: Float64Array;
  /** Where each dot is drawn. */
  readonly shown: Float64Array;
  private readonly speed: Float32Array;

  constructor(
    private readonly Delaunay: typeof DelaunayClass,
    readonly size: number,
    private readonly weights: Float32Array,
    private readonly rgba: Uint8ClampedArray,
    seed: number,
    maxDots: number,
  ) {
    const rand = random(seed);
    let mass = 0;
    for (const w of weights) mass += w;
    this.count = Math.max(200, Math.min(maxDots, Math.round(mass * 0.34)));
    this.targets = new Float64Array(this.count * 2);
    this.shown = new Float64Array(this.count * 2);
    this.speed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      // Each dot's home starts on one of the logo's own pixels, by rejection sampling on the weights.
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 400; tries++) {
        x = rand() * size;
        y = rand() * size;
        if (rand() < weights[(y | 0) * size + (x | 0)]) break;
      }
      this.targets[i * 2] = x;
      this.targets[i * 2 + 1] = y;
      this.shown[i * 2] = rand() * size;
      this.shown[i * 2 + 1] = rand() * size;
      this.speed[i] = 0.04 + rand() * 0.08;
    }
  }

  /** One Lloyd step: each target moves to its Voronoi cell's weighted centre. */
  relax() {
    const { size, weights, count, targets } = this;
    const delaunay = new this.Delaunay(targets);
    const cx = new Float64Array(count);
    const cy = new Float64Array(count);
    const mass = new Float64Array(count);
    let cell = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const w = weights[y * size + x];
        if (!w) continue;
        cell = delaunay.find(x + 0.5, y + 0.5, cell);
        cx[cell] += (x + 0.5) * w;
        cy[cell] += (y + 0.5) * w;
        mass[cell] += w;
      }
    }
    for (let i = 0; i < count; i++) {
      if (!mass[i]) continue;
      targets[i * 2] += (cx[i] / mass[i] - targets[i * 2]) * 1.5;
      targets[i * 2 + 1] += (cy[i] / mass[i] - targets[i * 2 + 1]) * 1.5;
    }
  }

  /** Moves the drawn dots toward their targets. Each dot has its own pace, so they arrive as a cloud, not a line. */
  fly() {
    const { count, targets, shown, speed } = this;
    for (let i = 0; i < count; i++) {
      shown[i * 2] += (targets[i * 2] - shown[i * 2]) * speed[i];
      shown[i * 2 + 1] += (targets[i * 2 + 1] - shown[i * 2 + 1]) * speed[i];
    }
  }

  /** The logo's own colour under a point, as a 4-bit-per-channel key: dots with the same key are drawn in one go. */
  colourKey(x: number, y: number): number {
    const { size, rgba } = this;
    const i = (Math.max(0, Math.min(size - 1, y | 0)) * size + Math.max(0, Math.min(size - 1, x | 0))) * 4;
    return ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
  }

  weightAt(x: number, y: number): number {
    const { size, weights } = this;
    return weights[Math.max(0, Math.min(size - 1, y | 0)) * size + Math.max(0, Math.min(size - 1, x | 0))];
  }
}

export const keyToCss = (key: number) => `rgb(${((key >> 8) & 15) * 17} ${((key >> 4) & 15) * 17} ${(key & 15) * 17})`;

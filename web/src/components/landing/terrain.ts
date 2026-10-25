import type { PaintFrame, SunGlow } from "@/components/ascii/ascii-gl";

// Mountains of ASCII, drawn with the voxel-space method (as in Comanche, 1992): one ray per screen column
// marches over a heightmap and draws vertical spans, nearest first. Sky pixels stay transparent so the shader
// paints its gradient and the sun there. Alpha between 0.55 and 1 sets how strongly a cell is drawn as a glyph:
// distant ridges flatten into haze and the foreground dissolves into the page colour.

const SIZE = 256; // heightmap side, a power of two so the world tiles
const MASK = SIZE - 1;
const RELIEF = 70; // world units from the lowest valley to the highest summit

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (d: number) => {
  const a = Math.abs(d) % SIZE;
  return Math.min(a, SIZE - a);
};

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise whose lattice wraps every `period` cells, so the heightmap tiles. */
function tileNoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// The drone flies a gentle weave along the range's flank; the range runs parallel, on its right.
// (The camera faces +y, so screen right is world -x.)
const K = (Math.PI * 2) / SIZE;
const PATH_X = 140;
const WEAVE = 7;
const MASSIF_X = 112;
const MASSIF_WIDTH = 26;
const pathX = (y: number) => PATH_X + Math.sin(y * K) * WEAVE;
const pathSlope = (y: number) => Math.cos(y * K) * WEAVE * K;
const pathCurve = (y: number) => -Math.sin(y * K) * WEAVE * K * K;

export interface Peak {
  x: number;
  y: number;
  text: string;
  found?: boolean;
}

/** Six questions, one per summit along the range. */
export const PEAKS: Peak[] = [
  { x: MASSIF_X + 4, y: 30, text: "Is your brand here?" },
  { x: MASSIF_X + 18, y: 66, text: "Maybe here??" },
  { x: MASSIF_X + 6, y: 102, text: "Here?" },
  { x: MASSIF_X - 3, y: 138, text: "…this one?" },
  { x: MASSIF_X + 3, y: 174, text: "Not here either." },
  { x: MASSIF_X - 4, y: 210, text: "Found it.", found: true },
];

const FLIGHT_SPEED = 8; // world units per second
const FLIGHT_START = PEAKS[0].y - 100; // the first question is the first one in view

interface Terrain {
  map: Float32Array;
  lit: Float32Array;
  /** Cruise altitude along the path, by world y, smoothed so the drone glides. */
  cruise: Float32Array;
}
const terrains = new Map<number, Terrain>();

function makeTerrain(seed: number): Terrain {
  // Ridged multifractal: sharp crests, soft valleys.
  const ridges = new Float32Array(SIZE * SIZE);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let h = 0;
      let amp = 1;
      let norm = 0;
      let cells = 4;
      for (let o = 0; o < 5; o++) {
        const f = cells / SIZE;
        const n = tileNoise(x * f, y * f, cells, seed + o * 17);
        const ridge = 1 - Math.abs(n * 2 - 1);
        h += ridge * ridge * amp;
        norm += amp;
        amp *= 0.5;
        cells *= 2;
      }
      h /= norm;
      ridges[y * SIZE + x] = h;
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }

  const map = new Float32Array(SIZE * SIZE);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const r = (ridges[y * SIZE + x] - lo) / (hi - lo);
      const dx = wrap(x - MASSIF_X) / MASSIF_WIDTH;
      const massif = Math.exp(-dx * dx);
      let h = r * (0.26 + 0.74 * massif);
      // Each named summit is a broad mountain, not a spike.
      for (const peak of PEAKS) {
        const px = wrap(x - peak.x);
        const py = wrap(y - peak.y);
        h += 0.5 * Math.exp(-(px * px + py * py) / (2 * 10 * 10));
      }
      map[y * SIZE + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  for (let i = 0; i < map.length; i++) map[i] = (map[i] - min) / (max - min);

  // Key light from the left, behind the camera and above: the faces turned toward the drone are lit.
  const lx = 0.45;
  const ly = -0.55;
  const lz = 0.7;
  const ln = Math.hypot(lx, ly, lz);
  const lit = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = (map[y * SIZE + ((x + 1) & MASK)] - map[y * SIZE + ((x - 1) & MASK)]) * 0.5 * RELIEF;
      const sy = (map[((y + 1) & MASK) * SIZE + x] - map[((y - 1) & MASK) * SIZE + x]) * 0.5 * RELIEF;
      const nn = Math.hypot(sx, sy, 1);
      lit[y * SIZE + x] = clamp01((-sx * lx - sy * ly + lz) / (nn * ln));
    }
  }

  // Cruise altitude: clear the ground under the path, never lower than most of the range.
  const cruise = new Float32Array(SIZE);
  for (let y = 0; y < SIZE; y++) {
    const x = Math.floor(pathX(y));
    let ground = 0;
    for (let d = -3; d <= 3; d++) ground = Math.max(ground, map[y * SIZE + ((x + d) & MASK)]);
    cruise[y] = Math.max(ground * RELIEF + 18, RELIEF * 0.72);
  }
  for (let pass = 0; pass < 3; pass++) {
    const copy = cruise.slice();
    for (let y = 0; y < SIZE; y++) {
      let sum = 0;
      for (let d = -12; d <= 12; d++) sum += copy[(y + d) & MASK];
      cruise[y] = sum / 25;
    }
  }
  return { map, lit, cruise };
}

function terrainFor(seed: number) {
  let terrain = terrains.get(seed);
  if (!terrain) {
    terrain = makeTerrain(seed);
    terrains.set(seed, terrain);
  }
  return terrain;
}

/** "#rrggbb" or a computed "rgb(r, g, b)". */
function parseColor(value: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

export interface TerrainPalette {
  /** Shadowed valley floor. */
  low: string;
  /** Mid slopes. */
  mid: string;
  /** Snow on the summits. */
  high: string;
  /** Aerial haze toward the horizon. */
  haze: string;
  /** What the foreground dissolves into: the page colour (update it with setNear when the theme changes). */
  near: string;
  sun: string;
}

/** The mood board's Lavender Steel, Coral Rush and Blossom Vapor card, as a range at dusk. */
export const DUSK: TerrainPalette = {
  low: "#202556",
  mid: "#6c72b6",
  high: "#fdf3ec",
  haze: "#f1c3dc",
  near: "#f3f1ea",
  sun: "#f8769c",
};
/** What a dark cell sits on. */
export const NIGHT_WASH = "#14163a";
/** Mountains made of the feed: dots and dashes thicken into tags, hearts, plays and handles (by ink coverage). */
export const FEED_RAMP = [" ", "·", ".", ":", "-", "+", "*", "#", "%", "♥", "▶", "&", "@"];

export interface PopupState {
  /** Summit position in character cells. */
  x: number;
  y: number;
  /** 1 when close, smaller with distance. */
  scale: number;
  visible: boolean;
}

export interface TerrainSnapshot {
  cols: number;
  rows: number;
  popups: PopupState[];
}

interface TerrainOptions {
  palette: TerrainPalette;
  /** "flight": the drone flies along the range. "panorama": a high, slow sideways drift for the footer. */
  mode: "flight" | "panorama";
  seed?: number;
}

/** Builds a painter for AsciiGL, plus where each named summit sits on screen and where the sun is. */
export function createTerrainPainter({ palette, mode, seed = 7 }: TerrainOptions) {
  const { map, lit, cruise } = terrainFor(seed);
  const [lowR, lowG, lowB] = parseColor(palette.low) ?? [0, 0, 0];
  const [midR, midG, midB] = parseColor(palette.mid) ?? [0, 0, 0];
  const [highR, highG, highB] = parseColor(palette.high) ?? [0, 0, 0];
  const [hazeR, hazeG, hazeB] = parseColor(palette.haze) ?? [0, 0, 0];
  let near = parseColor(palette.near) ?? [255, 255, 255];

  const flight = mode === "flight";
  const maxZ = flight ? 260 : 320;
  // Where the ground dissolves into the page, as fractions of the height.
  const fadeFrom = flight ? 0.76 : 0.8;
  const fadeTo = flight ? 0.985 : 0.98;

  const height = (x: number, y: number) => map[(Math.floor(y) & MASK) * SIZE + (Math.floor(x) & MASK)];
  const cruiseAt = (y: number) => {
    const i = Math.floor(y);
    const f = y - i;
    return cruise[i & MASK] * (1 - f) + cruise[(i + 1) & MASK] * f;
  };
  const state: TerrainSnapshot = {
    cols: 1,
    rows: 1,
    popups: PEAKS.map(() => ({ x: 0, y: 0, scale: 1, visible: false })),
  };
  const glow: SunGlow = { x: 0.66, y: 0.5, r: 0.22, disc: 0.065, strength: 0.6 };
  let image: ImageData | null = null;
  let pixels: Uint32Array | null = null;
  let ybuffer = new Float32Array(0);
  let scroll = 0;
  let revision = 0;

  const setScroll = (value: number) => {
    if (value === scroll) return;
    scroll = value;
    revision++;
  };
  const setNear = (color: string) => {
    const next = parseColor(color);
    if (!next || (next[0] === near[0] && next[1] === near[1] && next[2] === near[2])) return;
    near = next;
    revision++;
  };
  /** Changes whenever a frozen frame needs drawing again. */
  const getRevision = () => revision;
  const snapshot = () => state;
  const sun = () => (flight ? glow : null);

  const pack = (r: number, g: number, b: number, a: number) =>
    ((a << 24) | (Math.min(255, Math.round(b)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(r))) >>> 0;

  const paint = (ctx: CanvasRenderingContext2D, frame: PaintFrame) => {
    const { cols, rows, t, cellAspect } = frame;
    state.cols = cols;
    state.rows = rows;
    if (!image || image.width !== cols || image.height !== rows) {
      image = ctx.createImageData(cols, rows);
      pixels = new Uint32Array(image.data.buffer);
      ybuffer = new Float32Array(cols);
    }
    if (!pixels) return;
    pixels.fill(0);

    // Camera. Portrait screens get a longer lens, turned a little toward the range.
    const aspect = (cols * cellAspect) / rows;
    const fov = flight ? Math.min(1.25, Math.max(0.8, 0.55 + 0.45 * aspect)) : 1.5;
    const bias = flight ? (1.25 - fov) * 0.5 : 0;
    const focal = (cols / 2 / Math.tan(fov / 2)) * cellAspect; // screen rows per unit of height at unit depth
    // The panorama looks across the range from the foothills and drifts along it.
    const camY = flight ? FLIGHT_START + t * FLIGHT_SPEED : 40 + t * 2.4;
    const camX = flight ? pathX(camY) : 215;
    const heading = flight ? Math.PI / 2 - Math.atan(pathSlope(camY)) + bias : Math.PI;
    const altitude = flight ? cruiseAt(camY) + Math.sin(t * 0.37) * 2 : RELIEF * 0.95;
    const level = flight ? 0.66 - 0.1 * clamp01((aspect - 0.6) / 0.8) : 0.42;
    const horizon = rows * (level - (flight ? scroll * 0.16 : 0));
    // Banking into the turns: the horizon's slope, in rows per column.
    const roll = (flight ? pathCurve(camY) * 7.2 : 0) * cellAspect;
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    glow.y = (horizon - rows * 0.02) / rows;

    ybuffer.fill(rows);
    for (let x = 0; x < cols; x++) {
      const ray = (x / cols - 0.5) * fov;
      const dirX = Math.cos(heading + ray);
      const dirY = Math.sin(heading + ray);
      const perp = Math.cos(ray);
      const tilt = (x - cols / 2) * roll;
      let z = 1.2;
      let dz = 0.4;
      while (z < maxZ) {
        const dist = z / perp;
        const i = (Math.floor(camY + dirY * dist) & MASK) * SIZE + (Math.floor(camX + dirX * dist) & MASK);
        const e = map[i];
        const sy = ((altitude - e * RELIEF) / z) * focal + horizon + tilt;
        if (sy < ybuffer[x]) {
          const l = lit[i];
          // Valley to slope by height, snow on the summits, then light and shade.
          const band = e < 0.55 ? e / 0.55 : 1;
          let r = lowR + (midR - lowR) * band;
          let g = lowG + (midG - lowG) * band;
          let b = lowB + (midB - lowB) * band;
          const snow = smoothstep(0.68, 0.9, e) * (0.3 + 0.7 * l);
          r += (highR - r) * snow;
          g += (highG - g) * snow;
          b += (highB - b) * snow;
          const shade = 0.32 + 0.95 * l;
          r *= shade;
          g *= shade;
          b *= shade;
          // Aerial haze toward the horizon; far ridges also lose their glyphs.
          const far = smoothstep(0.12, 1, z / maxZ);
          r += (hazeR - r) * far * 0.9;
          g += (hazeG - g) * far * 0.9;
          b += (hazeB - b) * far * 0.9;
          const color = pack(r, g, b, Math.round(255 - 115 * far));
          const top = Math.max(0, Math.floor(sy));
          const bottom = Math.min(rows, Math.ceil(ybuffer[x]));
          for (let y = top; y < bottom; y++) pixels[y * cols + x] = color;
          ybuffer[x] = sy;
          if (sy <= 0) break;
        }
        z += dz;
        dz *= 1.022;
      }
    }

    // The foreground dissolves into the page: colour toward `near`, glyphs toward a solid fill.
    for (let y = Math.floor(rows * fadeFrom); y < rows; y++) {
      const f = smoothstep(fadeFrom, fadeTo, (y + 0.5) / rows);
      if (f <= 0) continue;
      for (let x = 0; x < cols; x++) {
        const p = pixels[y * cols + x];
        const a = p >>> 24;
        if (a === 0) continue; // sky stays sky
        const r = p & 255;
        const g = (p >>> 8) & 255;
        const b = (p >>> 16) & 255;
        const strength = (a - 140) / 115;
        pixels[y * cols + x] = pack(
          r + (near[0] - r) * f,
          g + (near[1] - g) * f,
          b + (near[2] - b) * f,
          Math.round(140 + 115 * strength * (1 - f)),
        );
      }
    }
    ctx.putImageData(image, 0, 0);

    if (!flight) return;
    // Where each named summit sits on screen, and whether a nearer ridge hides it.
    const hidden = (angle: number, depth: number, sy: number, tilt: number) => {
      const dirX = Math.cos(heading + angle);
      const dirY = Math.sin(heading + angle);
      const perp = Math.cos(angle);
      for (let z = 3; z < depth - 10; z += 1.5) {
        const dist = z / perp;
        const h = height(camX + dirX * dist, camY + dirY * dist) * RELIEF;
        if (((altitude - h) / z) * focal + horizon + tilt < sy - 1.5) return true;
      }
      return false;
    };
    PEAKS.forEach((peak, k) => {
      const popup = state.popups[k];
      popup.visible = false;
      // Nearest copy of the tiled summit ahead of the camera.
      let dy = peak.y - camY;
      dy -= Math.floor(dy / SIZE) * SIZE;
      let dx = peak.x - camX;
      dx -= Math.round(dx / SIZE) * SIZE;
      const forward = dx * cosH + dy * sinH;
      const side = -dx * sinH + dy * cosH;
      if (forward < 34 || forward > 150) return;
      const angle = Math.atan2(side, forward);
      const sx = (angle / fov + 0.5) * cols;
      if (sx < cols * 0.03 || sx > cols * 0.97) return;
      const tilt = (sx - cols / 2) * roll;
      const sy = ((altitude - height(peak.x, peak.y) * RELIEF) / forward) * focal + horizon + tilt;
      if (sy < rows * 0.13 || sy > rows * 0.86) return;
      if (hidden(angle, forward, sy, tilt)) return;
      popup.x = sx;
      popup.y = sy;
      popup.scale = 1 - 0.16 * clamp01((forward - 40) / 100);
      popup.visible = true;
    });
  };

  return { paint, setScroll, setNear, revision: getRevision, snapshot, sun };
}

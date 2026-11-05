import { type Box, boxAt, CLEAR_OF_UI, collidesWithUi, inSpan, type Moment } from "@/lib/details";
import { bodyAt, catmullRom, ghostLogoBox, handsAt, inStretches, type SceneIndex, SAFE_CORNER, trackAt } from "./geometry";

// The picture drawn over the Reel, once per video frame. Everything here is in CSS pixels of the full frame.

export type LayerId = "silhouette" | "spine" | "face" | "hands" | "product" | "logo" | "ghost" | "label" | "safe" | "fixes";
export type Layers = Record<LayerId, boolean>;

export const LAYER_COLOR: Record<LayerId, string> = {
  silhouette: "#ffffff",
  spine: "#ea4e12",
  face: "#48bcc6",
  hands: "#f2bd45",
  product: "#ff6a2b",
  logo: "#fbf7ec",
  ghost: "#c8b6ff",
  label: "#7fe0c3",
  safe: "#9a978f",
  fixes: "#f59a6e",
};

const RED = "#ff3d52";
const INK = "#121212";

export interface OverlayInput {
  t: number;
  width: number;
  height: number;
  /** Device pixels per CSS pixel, for a crisp hatch. */
  dpr: number;
  layers: Layers;
  ix: SceneIndex | null;
  selected: { moment: Moment; n: number } | null;
  labelSpans: { t_start: number; t_end: number }[];
  /** False when the report has no idea, because the visual check didn't run. */
  logoImage: HTMLImageElement | null;
  /** The reframe crop in fractions of the frame, or null when off or when the picture is already scaled to it. */
  crop: Box | null;
  cropName: string;
  mono: string;
}

/** A small filled label, kept inside the frame. A negative x counts from the right edge. */
function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg: string, maxWidth: number, mono: string) {
  ctx.font = `600 10px ${mono}`;
  let label = text;
  while (label.length > 3 && ctx.measureText(label).width + 10 > maxWidth - 4) label = label.slice(0, -2);
  if (label !== text) label = `${label.trimEnd()}...`;
  const w = ctx.measureText(label).width + 10;
  const h = 15;
  const left = x < 0 ? maxWidth - w + x : Math.max(2, Math.min(x, maxWidth - w - 2));
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + 5, y + h / 2 + 0.5);
}

/** A tag above the box, or below it when the box touches the top of the frame. */
const tagY = (top: number, bottom: number) => (top > 18 ? top - 17 : bottom + 2);

function cornerTicks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const len = Math.min(12, Math.max(5, Math.min(w, h) * 0.28));
  const path = new Path2D();
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x + w, y + h, -1, -1],
    [x, y + h, 1, -1],
  ]) {
    path.moveTo(cx + dx * len, cy);
    path.lineTo(cx, cy);
    path.lineTo(cx, cy + dy * len);
  }
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.stroke(path);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  ctx.strokeRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

function thinBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeRect(x, y, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.strokeRect(x, y, w, h);
}

/** Traces a spline through fractions of the frame. */
function spline(ctx: CanvasRenderingContext2D, points: number[], closed: boolean, width: number, height: number) {
  const curve = catmullRom(points, closed);
  ctx.beginPath();
  ctx.moveTo(points[0] * width, points[1] * height);
  for (let i = 0; i < curve.length; i += 6) {
    ctx.bezierCurveTo(curve[i] * width, curve[i + 1] * height, curve[i + 2] * width, curve[i + 3] * height, curve[i + 4] * width, curve[i + 5] * height);
  }
  if (closed) ctx.closePath();
}

const hatches = new WeakMap<CanvasRenderingContext2D, { pattern: CanvasPattern; dpr: number }>();

function hatch(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  const known = hatches.get(ctx);
  if (known?.dpr === dpr) return known.pattern;
  const size = Math.round(10 * dpr);
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const c = tile.getContext("2d");
  if (!c) return null;
  c.strokeStyle = "rgba(255,255,255,0.42)";
  c.lineWidth = dpr;
  c.beginPath();
  for (const off of [-size, 0, size]) {
    c.moveTo(off, size);
    c.lineTo(off + size, 0);
  }
  c.stroke();
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return null;
  pattern.setTransform(new DOMMatrix().scale(1 / dpr));
  hatches.set(ctx, { pattern, dpr });
  return pattern;
}

function drawSafeZones(ctx: CanvasRenderingContext2D, { width: w, height: h, dpr, mono }: OverlayInput) {
  const zones: [number, number, number, number, string][] = [
    [0, 0, w, CLEAR_OF_UI.y0 * h, "Instagram top bar"],
    [0, CLEAR_OF_UI.y1 * h, w, (1 - CLEAR_OF_UI.y1) * h, "Caption and account"],
    [CLEAR_OF_UI.x1 * w, CLEAR_OF_UI.y0 * h, (1 - CLEAR_OF_UI.x1) * w, (CLEAR_OF_UI.y1 - CLEAR_OF_UI.y0) * h, ""],
  ];
  const pattern = hatch(ctx, dpr);
  for (const [x, y, zw, zh, name] of zones) {
    ctx.fillStyle = "rgba(10,10,10,0.34)";
    ctx.fillRect(x, y, zw, zh);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, zw, zh);
    }
    if (name) tag(ctx, name, y ? 6 : -6, y ? y + zh - 21 : 8, "rgba(10,10,10,0.72)", "#f3f1ea", w, mono);
  }
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.strokeRect(0.5, CLEAR_OF_UI.y0 * h, CLEAR_OF_UI.x1 * w, (CLEAR_OF_UI.y1 - CLEAR_OF_UI.y0) * h);
  ctx.restore();
}

function drawReframeMask(ctx: CanvasRenderingContext2D, crop: Box, name: string, w: number, h: number, mono: string) {
  const [cx, cy, cw, ch] = [crop[0] * w, crop[1] * h, crop[2] * w, crop[3] * h];
  ctx.fillStyle = "rgba(8,8,8,0.68)";
  ctx.fillRect(0, 0, w, cy);
  ctx.fillRect(0, cy + ch, w, h - cy - ch);
  ctx.fillRect(0, cy, cx, ch);
  ctx.fillRect(cx + cw, cy, w - cx - cw, ch);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const k of [1 / 3, 2 / 3]) {
    ctx.moveTo(cx + cw * k, cy);
    ctx.lineTo(cx + cw * k, cy + ch);
    ctx.moveTo(cx, cy + ch * k);
    ctx.lineTo(cx + cw, cy + ch * k);
  }
  ctx.stroke();
  cornerTicks(ctx, cx, cy, cw, ch, "#ffffff");
  tag(ctx, `${name} crop`, cx + 6, cy + 6, "#ffffff", INK, w, mono);
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput) {
  const { t, width: w, height: h, layers, ix, selected, mono } = input;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;

  if (layers.safe) drawSafeZones(ctx, input);

  /** A tracked box goes red while it sits under Instagram's UI, once the zones are showing. */
  const tone = (box: Box, color: string) => (layers.safe && collidesWithUi(box) ? RED : color);

  if (ix) {
    const { shots, lanes, phrases } = ix.scene;
    const body = layers.silhouette || layers.spine ? bodyAt(ix, t) : null;

    if (body && layers.silhouette) {
      spline(ctx, body.outline, true, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.stroke();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
    }

    if (layers.face) {
      const face = trackAt(ix.face, t, shots, ix.trackStep);
      if (face) {
        const [x, y, bw, bh] = [face[0] * w, face[1] * h, face[2] * w, face[3] * h];
        const color = tone(face, LAYER_COLOR.face);
        thinBox(ctx, x, y, bw, bh, color);
        tag(ctx, "face", x, tagY(y, y + bh), "rgba(10,10,10,0.72)", color, w, mono);
      }
    }

    if (layers.hands) {
      for (const hand of handsAt(ix, t)) {
        const [x, y, bw, bh] = [hand[0] * w, hand[1] * h, hand[2] * w, hand[3] * h];
        const color = tone(hand, LAYER_COLOR.hands);
        thinBox(ctx, x, y, bw, bh, color);
        tag(ctx, "hand", x, tagY(y, y + bh), "rgba(10,10,10,0.72)", color, w, mono);
      }
    }

    if (body?.spine && layers.spine) {
      ctx.save();
      ctx.lineCap = "round";
      spline(ctx, body.spine, false, w, h);
      for (const [lineWidth, alpha] of [
        [11, 0.14],
        [6.5, 0.26],
      ]) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = `rgba(234,78,18,${alpha})`;
        ctx.stroke();
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = LAYER_COLOR.spine;
      ctx.stroke();
      for (let i = 0; i < body.spine.length; i += 2) {
        ctx.beginPath();
        ctx.arc(body.spine[i] * w, body.spine[i + 1] * h, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = LAYER_COLOR.spine;
        ctx.stroke();
      }
      ctx.restore();
      ctx.font = `600 9px ${mono}`;
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(10,10,10,0.72)";
      const sx = body.spine[4] * w + 8;
      const sy = body.spine[5] * h;
      ctx.fillRect(sx - 3, sy - 7, ctx.measureText("spine").width + 6, 14);
      ctx.fillStyle = "#ffb08e";
      ctx.fillText("spine", sx, sy + 0.5);
    }

    const product = trackAt(ix.product, t, shots, ix.trackStep);
    if (product && layers.product) {
      const [x, y, bw, bh] = [product[0] * w, product[1] * h, product[2] * w, product[3] * h];
      const color = tone(product, LAYER_COLOR.product);
      cornerTicks(ctx, x, y, bw, bh, color);
      tag(ctx, phrases.product, x, tagY(y, y + bh), color, INK, w, mono);
    }

    const missing = inStretches(lanes.logoMissing, t);
    if (layers.logo) {
      const logo = trackAt(ix.logo, t, shots, ix.trackStep);
      if (logo) {
        const [x, y, bw, bh] = [logo[0] * w, logo[1] * h, logo[2] * w, logo[3] * h];
        const color = tone(logo, LAYER_COLOR.logo);
        cornerTicks(ctx, x, y, bw, bh, color);
        tag(ctx, phrases.logo, x, tagY(y, y + bh), color, INK, w, mono);
      }
      // The ghost logo takes the corner itself when there's no product to sit beside.
      if (missing && !(layers.ghost && input.logoImage?.naturalWidth && !product)) {
        const [x, y, bw, bh] = [SAFE_CORNER[0] * w, SAFE_CORNER[1] * h, SAFE_CORNER[2] * w, SAFE_CORNER[3] * h];
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.strokeRect(x, y, bw, bh);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(x, y, bw, bh);
        ctx.restore();
        ctx.fillStyle = "rgba(10,10,10,0.55)";
        ctx.fillRect(x, y, bw, bh);
        ctx.font = `600 10px ${mono}`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText("Logo not seen", x + bw / 2, y + bh / 2 + 0.5, bw - 6);
        ctx.textAlign = "start";
      }
    }

    if (missing && layers.ghost && input.logoImage?.naturalWidth) {
      const image = input.logoImage;
      const box = ghostLogoBox(product, image.naturalWidth / image.naturalHeight, w, h);
      const [x, y, bw, bh] = [box[0] * w, box[1] * h, box[2] * w, box[3] * h];
      if (product) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = LAYER_COLOR.ghost;
        ctx.beginPath();
        const toRight = x > product[0] * w;
        ctx.moveTo(toRight ? (product[0] + product[2]) * w : product[0] * w, (product[1] + product[3] / 2) * h);
        ctx.lineTo(toRight ? x - 3 : x + bw + 3, y + bh / 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = "rgba(251,247,236,0.94)";
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 3, bw + 6, bh + 6, 3);
      ctx.fill();
      ctx.drawImage(image, x, y, bw, bh);
      tag(ctx, "ghost logo", x - 3, tagY(y - 3, y + bh + 3), "rgba(10,10,10,0.72)", LAYER_COLOR.ghost, w, mono);
    }
  }

  if (layers.label) {
    const on = inStretches(input.labelSpans, t);
    tag(ctx, on ? "Disclosure label on screen" : "No disclosure label now", 8, 8, on ? LAYER_COLOR.label : RED, on ? INK : "#ffffff", w, mono);
  }

  if (selected) {
    const span = selected.moment.spans.find((s) => inSpan(s, t));
    if (span?.boxes.length) {
      const box = boxAt(span, t);
      const [x, y, bw, bh] = [box[0] * w, box[1] * h, box[2] * w, box[3] * h];
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, 5);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = LAYER_COLOR.spine;
      ctx.stroke();
      tag(ctx, `${selected.n}. ${selected.moment.title}`, x, tagY(y, y + bh), LAYER_COLOR.spine, INK, w, mono);
    }
  }

  if (input.crop) drawReframeMask(ctx, input.crop, input.cropName, w, h, mono);
}

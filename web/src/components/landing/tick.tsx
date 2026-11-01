"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSulking } from "@/lib/tickle";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

// Tickle: the page's character. A pixel stopwatch drawn on a 48 x 48 grid and scaled up without smoothing.
// His face is the measurement: the LCD is his mouth and shows the hold he timed, and his mood is the verdict.

export type TickMood =
  | "idle"
  | "read"
  | "count"
  | "pass"
  | "fail"
  | "review"
  | "sleep"
  | "point"
  | "hi"
  | "hope"
  | "worry"
  | "surprise"
  | "pout"
  | "dizzy"
  | "spooky"
  | "puppy";
export type TickCard = "pass" | "fail" | "review" | null;
type Band = { from: number; to: number; line?: number };

export interface TickPose {
  mood: TickMood;
  /** Up to five characters (digits, a dot, H, I, ! and ?) or one icon: ♥ a heart, ⌒ a frown. */
  lcd?: string;
  card?: TickCard;
  /** Where his eyes point, each -1, 0 or 1. */
  look?: [number, number];
  walking?: boolean;
  /** Sulking: grumpy brows and puffed cheeks over whatever he is doing. */
  sulk?: boolean;
  /** Rows drawn as an x-ray (his gears, his bones and his heart), with the scan line's row. */
  xray?: Band;
  /** The rest of the family: Ms Tickle (teal crown, a bow, lashes) and the kids (yellow crowns). */
  variant?: "ms" | "kid";
  /** No bob or step: for a face painted onto a body that moves on its own (the cave's 3D Tickles). */
  steady?: boolean;
}

const N = 48;
const C = {
  ink: "#121212",
  paper: "#fbfaf6",
  face: "#f3f1ea",
  signal: "#ea4e12",
  signalLit: "#ff8a52",
  blush: "#f8c4ad",
  pass: "#0a7883",
  passLit: "#48bcc6",
  fail: "#b3152f",
  failLit: "#f37a88",
  review: "#f2bd45",
  glass: "#d6eeef",
};
type Palette = typeof C;
// The x-ray: what is ink becomes the bright line of the film, everything else its dark ground.
const XR: Palette = { ...C, ink: "#a9dde3", face: "#16262b", paper: "#16262b", signal: "#16262b", signalLit: "#a9dde3" };

const GLYPHS: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["0", "0", "0", "0", "1"],
  "-": ["000", "000", "111", "000", "000"],
  H: ["101", "101", "111", "101", "101"],
  N: ["101", "111", "111", "111", "101"],
  O: ["111", "101", "101", "101", "111"],
  I: ["111", "010", "010", "010", "111"],
  "!": ["1", "1", "1", "0", "1"],
  "?": ["111", "001", "011", "000", "010"],
  "♥": ["01010", "11111", "11111", "01110", "00100"],
  "⌒": ["00000", "01110", "10001", "00000", "00000"],
};
const HEART_SMALL = ["00000", "01010", "01110", "00100", "00000"];
// The ring of a dizzy eye, clockwise from the top; a gap runs round it.
const RING = [[1, 0], [2, 0], [3, 0], [4, 1], [4, 2], [4, 3], [3, 4], [2, 4], [1, 4], [0, 3], [0, 2], [0, 1]];

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function dots(ctx: Ctx, pts: number[][], dy: number, color: string) {
  for (const [x, y] of pts) rect(ctx, x, y + dy, 1, 1, color);
}

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y) + 0.35);
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

function bitmap(ctx: Ctx, rows: string[], x: number, y: number, color: string) {
  rows.forEach((row, ry) => {
    [...row].forEach((bit, rx) => {
      if (bit === "1") rect(ctx, x + rx, y + ry, 1, 1, color);
    });
  });
}

function glyphWidth(text: string) {
  return [...text].reduce((w, ch) => w + (GLYPHS[ch]?.[0].length ?? 0) + 1, -1);
}

/** The LCD holds 14 pixels: a reading too wide for it loses decimals, rounded, so 12.07 shows as 12.1. */
function fit(text: string) {
  let out = text;
  while (glyphWidth(out) > 14 && /^\d+\.\d{2,}$/.test(out)) {
    const places = out.split(".")[1].length - 1;
    out = Number(out).toFixed(places);
  }
  return out;
}

function glyphs(ctx: Ctx, text: string, x: number, y: number, color: string) {
  let cx = x;
  for (const ch of text) {
    const rows = GLYPHS[ch];
    if (!rows) continue;
    bitmap(ctx, rows, cx, y, color);
    cx += rows[0].length + 1;
  }
}

function card(ctx: Ctx, kind: Exclude<TickCard, null>, x: number, y: number, P: Palette, xray: boolean) {
  rect(ctx, x, y, 11, 12, P.ink);
  if (xray) {
    rect(ctx, x + 1, y + 1, 9, 10, P.face);
    return;
  }
  rect(ctx, x + 1, y + 1, 9, 10, kind === "pass" ? C.pass : kind === "fail" ? C.fail : C.review);
  const ink = kind === "review" ? C.ink : C.paper;
  if (kind === "pass") {
    dots(ctx, [[2, 6], [3, 7], [4, 8], [5, 7], [6, 6], [7, 5], [8, 4]].map(([dx, dy]) => [x + dx, y + dy]), 0, ink);
  } else if (kind === "fail") {
    for (let i = 0; i < 5; i++) {
      rect(ctx, x + 3 + i, y + 4 + i, 1, 1, ink);
      rect(ctx, x + 7 - i, y + 4 + i, 1, 1, ink);
    }
  } else {
    dots(ctx, [[4, 3], [5, 3], [6, 3], [3, 4], [7, 4], [7, 5], [6, 6], [5, 7], [5, 9]].map(([dx, dy]) => [x + dx, y + dy]), 0, ink);
  }
}

function gear(ctx: Ctx, cx: number, cy: number, r: number, teeth: number, turn: number, line: string, ground: string) {
  disc(ctx, cx, cy, r, line);
  disc(ctx, cx, cy, r - 1, ground);
  for (let k = 0; k < teeth; k++) {
    const a = turn + (k * 2 * Math.PI) / teeth;
    rect(ctx, cx + Math.round((r + 1) * Math.cos(a)), cy + Math.round((r + 1) * Math.sin(a)), 1, 1, line);
  }
  rect(ctx, cx, cy, 1, 1, line);
}

/** Hands on hips, elbows out: indignant. */
function akimbo(ctx: Ctx, oy: number, ink: string) {
  dots(ctx, [[8, 29], [7, 30], [6, 31], [6, 32], [7, 33], [8, 34]], oy, ink);
  dots(ctx, [[39, 29], [40, 30], [41, 31], [41, 32], [40, 33], [39, 34]], oy, ink);
  rect(ctx, 9, 34 + oy, 2, 2, ink);
  rect(ctx, 37, 34 + oy, 2, 2, ink);
}

/** A one-pixel paper rim around everything drawn so far, so he reads on dark grounds too. */
function rim(ctx: Ctx) {
  const src = ctx.getImageData(0, 0, N, N).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && src[(y * N + x) * 4 + 3] > 0;
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = C.paper;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x, y, 1, 1);
  ctx.restore();
}

function body(ctx: Ctx, pose: TickPose, time: number, still: boolean, P: Palette, xray: boolean) {
  const { mood } = pose;
  const sleeping = mood === "sleep";
  const pout = mood === "pout";
  const sulk = Boolean(pose.sulk) || pout;
  const hips = pout || (sulk && mood === "idle");
  const bob = still || pose.steady ? 0 : pose.walking ? Math.round(Math.abs(Math.sin(time * 9))) : Math.round((Math.sin(time * 3.2) + 1) / 2);
  const oy = sleeping ? 0 : -bob;
  const step = pose.walking && !still ? Math.floor(time * 6) % 2 : 0;

  // feet
  rect(ctx, 14, 43 - (step === 1 ? 1 : 0), 6, 2, P.ink);
  rect(ctx, 28, 43 - (step === 0 && pose.walking && !still ? 1 : 0), 6, 2, P.ink);

  // left arm: down at rest, up with the magnifier when reading
  if (mood === "read") {
    dots(ctx, [[9, 28], [8, 27], [7, 26], [7, 25]], oy, P.ink);
    disc(ctx, 6, 19 + oy, 4, P.ink);
    disc(ctx, 6, 19 + oy, 3, xray ? P.face : C.glass);
    if (!xray) rect(ctx, 5, 17 + oy, 1, 1, C.paper);
  } else if (!hips) {
    dots(ctx, [[9, 30], [8, 31], [7, 32], [7, 33]], oy, P.ink);
    rect(ctx, 6, 34 + oy, 2, 2, P.ink);
  }

  // right arm: holding a card up, pointing, waving, or down
  if (pose.card) {
    dots(ctx, [[39, 26], [40, 25], [40, 24], [41, 23], [41, 22], [42, 21]], oy, P.ink);
    card(ctx, pose.card, 36, 8 + oy, P, xray);
  } else if (mood === "point") {
    rect(ctx, 39, 28 + oy, 5, 1, P.ink);
    rect(ctx, 44, 27 + oy, 2, 2, P.ink);
  } else if (mood === "hi") {
    const up = still || Math.floor(time * 4.5) % 2 === 0;
    dots(ctx, up ? [[39, 26], [40, 25], [41, 24], [42, 23], [43, 22]] : [[39, 26], [40, 25], [40, 24], [41, 23], [41, 22]], oy, P.ink);
    rect(ctx, up ? 43 : 41, 20 + oy, 2, 2, P.ink);
  } else if (!hips) {
    dots(ctx, [[39, 30], [40, 31], [41, 32], [41, 33]], oy, P.ink);
    rect(ctx, 41, 34 + oy, 2, 2, P.ink);
  }

  // crown and side button: orange for him, teal for Ms Tickle, yellow for the kids
  const pressed = mood === "count" && !still && Math.floor(time * 2) % 2 === 0 ? 1 : 0;
  const crown = xray ? P.signal : pose.variant === "ms" ? C.pass : pose.variant === "kid" ? C.review : P.signal;
  const crownLit = xray ? P.signalLit : pose.variant === "ms" ? C.passLit : pose.variant === "kid" ? "#f7d27a" : P.signalLit;
  rect(ctx, 23, 8 + oy, 2, 4, P.ink);
  rect(ctx, 19, 4 + oy + pressed, 10, 5, P.ink);
  rect(ctx, 20, 5 + oy + pressed, 8, 3, crown);
  rect(ctx, 21, 5 + oy + pressed, 2, 1, crownLit);
  rect(ctx, 34, 11 + oy, 4, 4, P.ink);
  rect(ctx, 35, 12 + oy, 2, 2, crown);

  // case and face; in the horror beats the face goes dark
  const spooky = mood === "spooky" && !xray;
  disc(ctx, 24, 27 + oy, 15, P.ink);
  disc(ctx, 24, 27 + oy, 13, spooky ? "#2b2624" : P.face);
  if (pose.variant === "ms" && !xray) {
    // a bow on the left of her crown
    bitmap(ctx, ["1000001", "1100011", "1111111", "1100011", "1000001"], 10, 9 + oy, C.failLit);
    rect(ctx, 13, 11 + oy, 1, 1, C.fail);
  }
  rect(ctx, 15, 17 + oy, 3, 1, P.paper);
  rect(ctx, 14, 18 + oy, 2, 1, P.paper);

  if (xray) {
    // inside: two gears, the balance spring, and a heart that beats once a second (he is a clock, after all)
    const t = still ? 0 : time;
    gear(ctx, 19, 31 + oy, 4, 8, t * 2.2, P.ink, P.face);
    gear(ctx, 27, 34 + oy, 3, 6, -t * 2.9 + 0.3, P.ink, P.face);
    dots(ctx, [[24, 13], [23, 14], [25, 15], [23, 16], [24, 17]], oy, P.ink);
    bitmap(ctx, !still && time % 1 < 0.16 ? GLYPHS["♥"] : HEART_SMALL, 22, 19 + oy, C.failLit);
    if (hips) akimbo(ctx, oy, P.ink);
    return;
  }

  // eyes
  const blink = !still && !sleeping && mood !== "surprise" && mood !== "dizzy" && time % 3.4 > 3.25;
  const [lx, ly] = pose.look ?? [0, 0];
  const ex = pout ? -1 : Math.max(-1, Math.min(1, lx));
  const ey = pout ? 0 : Math.max(-1, Math.min(1, ly));
  const eyeY = 20 + oy + ey;
  let browsDrawn = false;
  if (sleeping || blink) {
    rect(ctx, 17 + ex, eyeY + 2, 3, 1, C.ink);
    rect(ctx, 28 + ex, eyeY + 2, 3, 1, C.ink);
  } else if ((mood === "pass" && !sulk) || mood === "hi") {
    for (const x0 of [16, 28]) dots(ctx, [[0, 2], [1, 1], [2, 1], [3, 2]].map(([dx, dy]) => [x0 + dx + ex, eyeY + dy]), 0, C.ink);
  } else if (mood === "fail") {
    for (const x0 of [16, 28]) {
      const x = x0 + ex;
      rect(ctx, x + 1, eyeY - 1, 2, 1, C.ink);
      rect(ctx, x, eyeY, 1, 3, C.ink);
      rect(ctx, x + 3, eyeY, 1, 3, C.ink);
      rect(ctx, x + 1, eyeY + 3, 2, 1, C.ink);
      rect(ctx, x + 1, eyeY + 1, 1, 1, C.ink);
    }
    rect(ctx, 16, eyeY - 4, 4, 1, C.ink);
    rect(ctx, 28, eyeY - 4, 4, 1, C.ink);
    browsDrawn = true;
  } else if (mood === "review") {
    rect(ctx, 17 + ex, eyeY + 1, 3, 2, C.ink);
    rect(ctx, 28 + ex, eyeY, 2, 4, C.ink);
    rect(ctx, 16, eyeY - 3, 4, 1, C.ink);
    rect(ctx, 28, eyeY - 2, 4, 1, C.ink);
    browsDrawn = true;
  } else if (mood === "surprise") {
    for (const x0 of [17, 28]) bitmap(ctx, ["111", "101", "111"], x0 + ex, eyeY, C.ink);
    rect(ctx, 17, eyeY - 3, 3, 1, C.ink);
    rect(ctx, 28, eyeY - 3, 3, 1, C.ink);
    browsDrawn = true;
  } else if (mood === "hope") {
    for (const x0 of [17, 28]) {
      rect(ctx, x0 + ex, eyeY - 1, 3, 5, C.ink);
      rect(ctx, x0 + ex, eyeY - 1, 1, 1, C.face);
      rect(ctx, x0 + 2 + ex, eyeY - 1, 1, 1, C.face);
      rect(ctx, x0 + ex, eyeY + 3, 1, 1, C.face);
      rect(ctx, x0 + 2 + ex, eyeY + 3, 1, 1, C.face);
      rect(ctx, x0 + ex, eyeY, 1, 1, C.paper);
    }
  } else if (mood === "worry") {
    rect(ctx, 18 + ex, eyeY + 1, 2, 2, C.ink);
    rect(ctx, 28 + ex, eyeY + 1, 2, 2, C.ink);
    dots(ctx, [[16, -1], [17, -1], [18, -2], [19, -2], [28, -2], [29, -2], [30, -1], [31, -1]], eyeY, C.ink);
    browsDrawn = true;
  } else if (mood === "dizzy") {
    const turn = still ? 0 : Math.floor(time * 14);
    for (const [x0, dir] of [[16, 1], [27, -1]]) {
      RING.forEach(([dx, dy], k) => {
        const gap = (((turn * dir) % 12) + 12) % 12;
        if (k !== gap && k !== (gap + 1) % 12) rect(ctx, x0 + dx, eyeY - 1 + dy, 1, 1, C.ink);
      });
      rect(ctx, x0 + 2, eyeY + 1, 1, 1, C.ink);
    }
  } else if (mood === "puppy") {
    // big wet eyes, brows raised in the middle, and a tear on its way down
    for (const x0 of [16, 28]) {
      rect(ctx, x0 + ex, eyeY - 1, 4, 5, C.ink);
      rect(ctx, x0 + 1 + ex, eyeY, 1, 1, C.paper);
      rect(ctx, x0 + 2 + ex, eyeY + 2, 1, 1, C.paper);
    }
    dots(ctx, [[16, -2], [17, -3], [18, -3], [19, -4], [28, -4], [29, -3], [30, -3], [31, -2]], eyeY, C.ink);
    const drop = still ? 0 : Math.floor((time * 3) % 4);
    dots(ctx, [[17, 4 + drop], [17, 5 + drop]], eyeY, C.glass);
    browsDrawn = true;
  } else if (spooky) {
    for (const x0 of [17, 28]) {
      rect(ctx, x0 + ex, eyeY, 3, 3, C.fail);
      rect(ctx, x0 + 1 + ex, eyeY + 1, 1, 1, C.failLit);
    }
    dots(ctx, [[16, -3], [17, -3], [18, -2], [19, -2], [28, -2], [29, -2], [30, -3], [31, -3]], eyeY, C.failLit);
    browsDrawn = true;
  } else if (pout) {
    rect(ctx, 16, eyeY + 1, 4, 1, C.ink);
    rect(ctx, 28, eyeY + 1, 4, 1, C.ink);
    rect(ctx, 17 + ex, eyeY + 2, 2, 2, C.ink);
    rect(ctx, 28 + ex, eyeY + 2, 2, 2, C.ink);
  } else {
    const h = mood === "count" ? 3 : 4;
    rect(ctx, 18 + ex, eyeY + (4 - h), 2, h, C.ink);
    rect(ctx, 28 + ex, eyeY + (4 - h), 2, h, C.ink);
    if (mood === "count" && !sulk) {
      rect(ctx, 17, eyeY - 2, 4, 1, C.ink);
      rect(ctx, 27, eyeY - 2, 4, 1, C.ink);
      browsDrawn = true;
    }
  }
  if (pose.variant === "ms" && !sleeping && !blink && !spooky) {
    rect(ctx, 16 + ex, eyeY - 1, 1, 1, C.ink);
    rect(ctx, 31 + ex, eyeY - 1, 1, 1, C.ink);
  }
  // sulking: brows that slope down to the middle
  if (sulk && !sleeping && !browsDrawn) dots(ctx, [[16, -3], [17, -3], [18, -2], [19, -2], [28, -2], [29, -2], [30, -3], [31, -3]], eyeY, C.ink);

  // cheeks, puffed when he sulks
  if (!sleeping && !spooky) {
    rect(ctx, sulk ? 13 : 14, 25 + oy, sulk ? 3 : 2, sulk ? 2 : 1, C.blush);
    rect(ctx, 32, 25 + oy, sulk ? 3 : 2, sulk ? 2 : 1, C.blush);
  }

  // the LCD is his mouth: it shows what he measured
  rect(ctx, 16, 29 + oy, 16, 8, C.ink);
  rect(ctx, 16, 29 + oy, 1, 1, C.face);
  rect(ctx, 31, 29 + oy, 1, 1, C.face);
  rect(ctx, 16, 36 + oy, 1, 1, C.face);
  rect(ctx, 31, 36 + oy, 1, 1, C.face);
  const text = fit(pose.lcd ?? (pout || mood === "puppy" ? "⌒" : "")).slice(0, 5);
  const lit =
    text === "♥" || spooky
      ? C.failLit
      : mood === "pass"
        ? C.passLit
        : mood === "fail"
          ? C.failLit
          : mood === "review"
            ? C.review
            : C.signalLit;
  if (sleeping) rect(ctx, 21, 33 + oy, 6, 1, C.signal);
  else if (text) glyphs(ctx, text, 24 - Math.ceil(glyphWidth(text) / 2), 31 + oy, lit);

  if (hips) akimbo(ctx, oy, C.ink);

  if (sleeping) {
    const rise = still ? 0 : Math.floor((time * 4) % 6);
    const z = (x: number, y: number) => {
      rect(ctx, x, y, 3, 1, C.ink);
      rect(ctx, x + 1, y + 1, 1, 1, C.ink);
      rect(ctx, x, y + 2, 3, 1, C.ink);
    };
    z(37, 10 - rise);
    z(41, 4 - Math.floor(rise / 2));
  }
  // a huff of steam now and then while he sulks
  if (sulk && !sleeping && !still) {
    const k = (time % 2.6) / 0.9;
    if (k < 1) {
      const x = 39 + Math.floor(k * 3);
      const y = 13 - Math.floor(k * 8) + oy;
      rect(ctx, x + 1, y, 2, 1, C.ink);
      rect(ctx, x, y + 1, 4, 1, C.ink);
      rect(ctx, x + 1, y + 2, 2, 1, C.ink);
    }
  }
  // a bead of sweat when he worries
  if (mood === "worry") {
    dots(ctx, [[11, 13], [10, 14], [12, 14], [10, 15], [12, 15], [11, 16]], oy, C.ink);
    dots(ctx, [[11, 14], [11, 15]], oy, C.glass);
  }
}

/** Draws one frame of Tickle. `time` drives the bob, the blink and the walk; `still` freezes them. */
export function drawTick(ctx: Ctx, pose: TickPose, time: number, still: boolean, outlined = false) {
  ctx.clearRect(0, 0, N, N);
  body(ctx, pose, time, still, C, false);
  const band = pose.xray;
  if (band && band.to > band.from) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, band.from, N, band.to - band.from);
    ctx.clip();
    ctx.clearRect(0, 0, N, N);
    body(ctx, pose, time, still, XR, true);
    ctx.restore();
  }
  if (band?.line !== undefined && band.line > 0 && band.line < N) rect(ctx, 6, band.line, 36, 1, C.signalLit);
  if (outlined) rim(ctx);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The scan that passes over him: a poke x-rays him top to bottom and back; boot reveals him from an x-ray. */
function scanBand(scan: { start: number; kind: "poke" | "boot" }, now: number): Band | null {
  const t = now - scan.start;
  if (scan.kind === "boot") {
    if (t < 450) return { from: 0, to: N };
    if (t < 1250) {
      const y = Math.round(ease((t - 450) / 800) * N);
      return { from: y, to: N, line: y };
    }
    return null;
  }
  if (t < 550) {
    const y = Math.round(ease(t / 550) * N);
    return { from: 0, to: y, line: y };
  }
  if (t < 1500) return { from: 0, to: N };
  if (t < 2000) {
    const y = Math.round(ease((t - 1500) / 500) * N);
    return { from: y, to: N, line: y };
  }
  return null;
}

type Override = { text: string; mood?: TickMood; lcd?: string; card?: TickCard; xray?: Band };

interface TickProps extends TickPose {
  /** CSS size in px; the sprite scales by whole pixels where it can. */
  size: number;
  /** Eyes follow the pointer while it moves. */
  followPointer?: boolean;
  /** A paper rim, for dark grounds. */
  outlined?: boolean;
  className?: string;
  label?: string;
  /** A line he says, in a bubble above him. */
  say?: string;
  /** Clicking him gets a reaction: a squash, an x-ray of himself, and then he times the pokes. */
  pokeable?: boolean;
  /** He arrives as an x-ray and a scan line reveals him. */
  boot?: boolean;
}

export function Tick({
  size,
  followPointer,
  outlined = false,
  className,
  label,
  say,
  pokeable = false,
  boot = false,
  ...pose
}: TickProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const sulking = useSulking();
  const [override, setOverride] = useState<Override | null>(null);
  const shown: TickPose = { ...pose, sulk: pose.sulk ?? sulking };
  if (override) {
    shown.mood = override.mood ?? pose.mood;
    shown.lcd = override.lcd ?? pose.lcd;
    if (override.card !== undefined) shown.card = override.card;
    if (override.xray) shown.xray = override.xray;
  }
  const text = override?.text ?? say;
  const poseRef = useRef<TickPose>(shown);
  const lookRef = useRef<[number, number] | null>(null);
  const scanRef = useRef<{ start: number; kind: "poke" | "boot" } | null>(null);
  const pokes = useRef({ count: 0, first: 0, last: 0, timer: 0 });
  useEffect(() => {
    poseRef.current = shown;
  });

  useEffect(() => {
    if (boot && !reduced) scanRef.current = { start: performance.now(), kind: "boot" };
  }, [boot, reduced]);

  useEffect(() => {
    const p = pokes.current;
    return () => window.clearTimeout(p.timer);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx) return;
    let frame = 0;
    let visible = true;
    const start = performance.now();
    const render = () => {
      const p = poseRef.current;
      const now = performance.now();
      let xray = p.xray;
      if (scanRef.current) {
        const band = scanBand(scanRef.current, now);
        if (band) xray = band;
        else scanRef.current = null;
      }
      drawTick(ctx, { ...p, look: lookRef.current ?? p.look, xray }, (now - start) / 1000, reduced, outlined);
    };
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (visible && !document.hidden) render();
    };
    render();
    if (!reduced) frame = requestAnimationFrame(loop);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const far = Math.hypot(dx, dy) > r.width * 0.6;
      lookRef.current = far
        ? [Math.sign(dx) * (Math.abs(dx) > r.width * 0.4 ? 1 : 0), Math.sign(dy) * (Math.abs(dy) > r.height * 0.5 ? 1 : 0)]
        : null;
      if (reduced) render();
    };
    if (followPointer) window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, [reduced, followPointer, outlined]);

  // Redraw at once when the pose changes under reduced motion (no loop is running then).
  useEffect(() => {
    if (!reduced) return;
    const ctx = ref.current?.getContext("2d", { willReadFrequently: true });
    if (ctx) drawTick(ctx, { ...shown, look: lookRef.current ?? shown.look }, 0, true, outlined);
  });

  // Keep the bubble inside the window. Measured from its box and untransformed width, not its on-screen rect,
  // which is still scaled down while the bubble pops in.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    const center = box.left + box.width / 2;
    const half = el.offsetWidth / 2;
    const vw = document.documentElement.clientWidth;
    const shift = center - half < 8 ? 8 - (center - half) : center + half > vw - 8 ? vw - 8 - (center + half) : 0;
    el.style.setProperty("--shift", `${Math.round(shift)}px`);
  }, [text]);

  const poke = () => {
    const now = performance.now();
    const p = pokes.current;
    if (now - p.last > 3000) {
      p.count = 0;
      p.first = now;
    }
    p.count += 1;
    p.last = now;
    const n = p.count;
    const secs = ((now - p.first) / 1000).toFixed(1);
    if (!reduced)
      ref.current?.animate(
        [
          { transform: "scale(1, 1)" },
          { transform: "scale(1.16, 0.84)", offset: 0.18 },
          { transform: "scale(0.92, 1.1)", offset: 0.45 },
          { transform: "scale(1.03, 0.97)", offset: 0.72 },
          { transform: "scale(1, 1)" },
        ],
        { duration: 520, easing: "ease-out" },
      );
    let next: Override;
    if (n === 1) {
      next = {
        text: sulking ? "Scanned myself: no undisclosed ads. Still sulking." : "Scanned myself: no undisclosed ads. One heart.",
        mood: "surprise",
        xray: reduced ? { from: 0, to: N } : undefined,
      };
      if (!reduced) scanRef.current = { start: now, kind: "poke" };
    } else if (n === 2) next = { text: "Careful. I’m calibrated.", mood: "surprise", lcd: "!" };
    else if (n < 8) next = { text: `${n} pokes in ${secs}s.`, mood: "count", lcd: secs };
    else next = { text: `${n} pokes in ${secs}s. That’s a fail.`, mood: "fail", lcd: String(n), card: "fail" };
    setOverride(next);
    window.clearTimeout(p.timer);
    p.timer = window.setTimeout(() => setOverride(null), n === 1 ? 2600 : 1800);
  };

  return (
    <span className={cn("lp-tickbox", pokeable && "is-pokeable")} onClick={pokeable ? poke : undefined}>
      {text ? (
        <span ref={bubbleRef} className="lp-bubble" data-mood={shown.mood} aria-hidden="true">
          {text}
        </span>
      ) : null}
      <canvas
        ref={ref}
        width={N}
        height={N}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className={cn("lp-tick", className)}
        style={{ width: size, height: size }}
      />
    </span>
  );
}

"use client";

import { useEffect, useRef, type CSSProperties } from "react";

// Tiny bitmaps, one character per pixel, drawn on a canvas and scaled up without smoothing: the Tickles' front door
// on the cave's gate.
const PAL: Record<string, string> = {
  k: "#121212",
  O: "#ff8a52",
  b: "#5a3b2a",
  B: "#8a5f3f",
  Y: "#c98f1c",
};

const door = (kind: "closed" | "boarded") => {
  const body = ["kBBBBBBBk", "kBbbbbbBk", "kBbBBBbBk", "kBbBBBbBk", "kBbbbbbBk", "kBBBBBBBk", "kBBBBBOOk"];
  const rows = Array.from({ length: 14 }, (_, i) => (kind === "boarded" && (i === 3 || i === 9) ? "YYYYYYYYY" : body[i % body.length]));
  return ["kkkkkkkkk", ...rows, "kkkkkkkkk"];
};

const ART = {
  doorClosed: door("closed"),
  doorBoarded: door("boarded"),
} satisfies Record<string, string[]>;

export type ArtName = keyof typeof ART;

/** One bitmap at `cell` CSS pixels per pixel. */
export function Pixel({ art, cell, className, style }: { art: ArtName; cell: number; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rows = ART[art];
  const w = rows[0].length;
  const h = rows.length;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const color = PAL[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }),
    );
  }, [rows, w, h]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      aria-hidden="true"
      className={className}
      style={{ width: w * cell, height: h * cell, imageRendering: "pixelated", ...style }}
    />
  );
}

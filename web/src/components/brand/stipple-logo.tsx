"use client";

import { useEffect, useRef, useState } from "react";
import { keyToCss, plateFor, PLATES, seedOf, Stippler, weightsFor } from "@/lib/stipple";
import { cn } from "@/lib/utils";

const SOURCE = 180;
const RELAX_FRAMES = 44;
const TOTAL_FRAMES = 132;

/** The logo's pixels on a square, with a little room around them. */
function logoPixels(img: HTMLImageElement): Uint8ClampedArray {
  const off = document.createElement("canvas");
  off.width = off.height = SOURCE;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No canvas");
  const w = img.naturalWidth || SOURCE;
  const h = img.naturalHeight || SOURCE;
  const scale = (SOURCE * 0.84) / Math.max(w, h);
  ctx.drawImage(img, (SOURCE - w * scale) / 2, (SOURCE - h * scale) / 2, w * scale, h * scale);
  return ctx.getImageData(0, 0, SOURCE, SOURCE).data;
}

/**
 * The kit's real logo. On its first showing (play) it forms from dots settling onto its own pixels on a canvas, then the
 * image itself takes over; any other time, and under reduced motion, the image just shows. The logo is a data: URL saved
 * with the kit, so the canvas can always read it.
 */
export function StippleLogo({ src, name, play, onSettled }: { src: string; name: string; play: boolean; onSettled?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [plate, setPlate] = useState<"light" | "dark">("light");
  const [settled, setSettled] = useState(false);

  // The plate is read from the logo's pixels, whichever way it's shown.
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => {
        if (live) setPlate(plateFor(logoPixels(img)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let stopped = false;
    const finish = () => {
      if (stopped) return;
      setSettled(true);
      onSettled?.();
    };
    void (async () => {
      const { Delaunay } = await import("d3-delaunay");
      const img = new Image();
      img.src = src;
      await img.decode();
      if (stopped || !canvas.current) return;
      const rgba = logoPixels(img);
      const on = PLATES[plateFor(rgba)];
      const el = canvas.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = el.height = Math.round(el.clientWidth * dpr);
      const ctx = el.getContext("2d");
      if (!ctx) throw new Error("No canvas");
      const narrow = el.clientWidth < 180;
      const stippler = new Stippler(Delaunay, SOURCE, weightsFor(rgba, on), rgba, seedOf(name), narrow ? 1400 : 2400);
      const scale = el.width / SOURCE;
      const radius = 0.62 * Math.sqrt(1600 / Math.max(stippler.count, 300));
      let frame = 0;
      const draw = () => {
        ctx.clearRect(0, 0, el.width, el.height);
        const buckets = new Map<number, number[]>();
        for (let i = 0; i < stippler.count; i++) {
          const key = stippler.colourKey(stippler.targets[i * 2], stippler.targets[i * 2 + 1]);
          let bucket = buckets.get(key);
          if (!bucket) buckets.set(key, (bucket = []));
          bucket.push(i);
        }
        for (const [key, dots] of buckets) {
          ctx.fillStyle = keyToCss(key);
          ctx.beginPath();
          for (const i of dots) {
            const x = stippler.shown[i * 2];
            const y = stippler.shown[i * 2 + 1];
            const r = radius * (0.7 + 0.55 * stippler.weightAt(stippler.targets[i * 2], stippler.targets[i * 2 + 1])) * scale;
            ctx.moveTo(x * scale + r, y * scale);
            ctx.arc(x * scale, y * scale, r, 0, 6.283);
          }
          ctx.fill();
        }
      };
      const tick = () => {
        if (stopped) return;
        if (frame < RELAX_FRAMES) stippler.relax();
        stippler.fly();
        draw();
        frame += 1;
        if (frame < TOTAL_FRAMES) raf = requestAnimationFrame(tick);
        else finish();
      };
      raf = requestAnimationFrame(tick);
    })().catch(finish);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    // Runs once per showing. onSettled is the parent's and may change identity; the first one is the one that counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, src, name]);

  return (
    <div className={cn("kit-plate", plate === "dark" && "kit-plate-dark")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a small data: URL saved with the kit; next/image adds nothing here */}
      <img ref={image} src={src} alt={`${name} logo`} className={cn("kit-logo", play && !settled && "kit-logo-waiting")} />
      <canvas ref={canvas} aria-hidden="true" className={cn("kit-stipple", (!play || settled) && "kit-stipple-gone")} />
    </div>
  );
}

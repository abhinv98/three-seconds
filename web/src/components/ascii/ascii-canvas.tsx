"use client";

import { useEffect, useRef } from "react";
import { useMotionPaused } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Tones a scene can paint a cell in. Colours come from the design tokens at draw time. */
export const TONE = { fg: 0, muted: 1, signal: 2, faint: 3 } as const;

export interface AsciiFrame {
  cols: number;
  rows: number;
  /** Seconds since the scene started (or the external clock's value). */
  t: number;
  /** Cell width / cell height, so scenes can keep circles round. */
  cellAspect: number;
  /** 0..1 brightness per cell; the ramp turns it into a glyph. */
  level: Float32Array;
  /** TONE per cell. */
  tone: Uint8Array;
}

export type AsciiScene = (frame: AsciiFrame) => void;

interface AsciiCanvasProps {
  scene: AsciiScene;
  /** Glyph size in px. */
  fontSize?: number;
  lineHeight?: number;
  /** Darkest to brightest. Index 0 should be a space. */
  ramp?: string;
  fps?: number;
  /** External clock in seconds (e.g. a shared story time). Defaults to elapsed time. */
  clock?: () => number;
  /** Time drawn once, without animating, when the viewer prefers reduced motion. */
  stillTime?: number;
  /** CSS custom properties used for each tone, in TONE order. */
  tones?: [string, string, string, string];
  className?: string;
}

const DEFAULT_RAMP = " .·:-=+*x%#@";
const DEFAULT_TONES: [string, string, string, string] = ["--foreground", "--muted-foreground", "--brand", "--border"];

function cssColor(element: Element, name: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Draws a procedural scene as monospaced characters. One fillText per row and tone keeps it cheap;
 * it only animates while on screen and the tab is visible, and holds a still frame under reduced motion.
 */
export function AsciiCanvas({
  scene,
  fontSize = 10,
  lineHeight,
  ramp = DEFAULT_RAMP,
  fps = 24,
  clock,
  stillTime = 0,
  tones = DEFAULT_TONES,
  className,
}: AsciiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const clockRef = useRef(clock);
  const paused = useMotionPaused();
  useEffect(() => {
    sceneRef.current = scene;
    clockRef.current = clock;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const lh = lineHeight ?? Math.round(fontSize * 1.18);
    // Reduced motion holds the still frame; the page's pause switch freezes the current one.
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reduce = paused || prefersReduced;
    const rootStyle = getComputedStyle(document.documentElement);
    const family =
      rootStyle.getPropertyValue("--font-jetbrains-mono").trim() || '"JetBrains Mono", ui-monospace, monospace';

    let cols = 0;
    let rows = 0;
    let cellW = fontSize * 0.6;
    let level = new Float32Array(0);
    let tone = new Uint8Array(0);
    let colors: string[] = [];
    let frame = 0;
    let visible = false;
    let last = 0;
    const started = performance.now();
    const glyphs = [...ramp];

    const readColors = () => {
      colors = tones.map((name, i) => cssColor(canvas, name, i === 2 ? "#ea4e12" : "#121212"));
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.font = `${fontSize}px ${family}`;
      context.textBaseline = "top";
      cellW = context.measureText("M").width || fontSize * 0.6;
      cols = Math.max(1, Math.floor(rect.width / cellW));
      rows = Math.max(1, Math.floor(rect.height / lh));
      level = new Float32Array(cols * rows);
      tone = new Uint8Array(cols * rows);
    };

    const draw = (t: number) => {
      if (cols === 0) return;
      level.fill(0);
      tone.fill(0);
      sceneRef.current({ cols, rows, t, cellAspect: cellW / lh, level, tone });
      context.clearRect(0, 0, canvas.width, canvas.height);
      const n = glyphs.length - 1;
      for (let k = 0; k < 4; k++) {
        context.fillStyle = colors[k];
        for (let r = 0; r < rows; r++) {
          let line = "";
          let any = false;
          for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const v = level[i];
            if (tone[i] === k && v > 0.001) {
              const g = glyphs[Math.min(n, Math.max(0, Math.round(v * n)))];
              line += g;
              if (g !== " ") any = true;
            } else {
              line += " ";
            }
          }
          if (any) context.fillText(line, 0, r * lh);
        }
      }
    };

    const now = () => (clockRef.current ? clockRef.current() : (performance.now() - started) / 1000);
    const current = () => (prefersReduced ? stillTime : now());

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < 1000 / fps) return;
      last = time;
      draw(now());
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (reduce) {
        draw(current());
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    const stop = () => cancelAnimationFrame(frame);

    let cancelled = false;
    void document.fonts.load(`${fontSize}px ${family}`).finally(() => {
      if (cancelled) return;
      readColors();
      resize();
      draw(current());
      if (visible && !document.hidden) start();
    });

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw(current());
    });
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
      else stop();
    });
    intersection.observe(canvas);

    const onVisibility = () => (document.hidden || !visible ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    // Theme switches (data-theme or the OS setting) recolour the glyphs.
    const themeObserver = new MutationObserver(() => {
      readColors();
      draw(current());
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      readColors();
      draw(current());
    };
    media.addEventListener("change", onScheme);

    return () => {
      cancelled = true;
      stop();
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      media.removeEventListener("change", onScheme);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fontSize, lineHeight, ramp, fps, stillTime, tones, paused]);

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("block h-full w-full", className)} />;
}

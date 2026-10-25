"use client";

import { useEffect, useMemo, useRef } from "react";
import { AsciiCanvas } from "@/components/ascii/ascii-canvas";
import { makeFieldScene } from "@/components/ascii/scenes";
import { cn } from "@/lib/utils";

const FIELD_TONES: [string, string, string, string] = ["--foreground", "--muted-foreground", "--brand", "--border"];

/** Quiet zone behind the hero copy: left on wide screens, top on narrow ones. */
function clearZone(u: number, v: number) {
  const wide = typeof window !== "undefined" && window.innerWidth >= 1024;
  const [cx, cy, rx, ry] = wide ? [0.26, 0.46, 0.34, 0.44] : [0.5, 0.3, 0.75, 0.32];
  const d = ((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2;
  return d < 1 ? 0.12 + 0.88 * d * d : 1;
}

/**
 * The hero's living type grid, after x6sense's pixel field: drifting clusters, single twinkles,
 * glyphs that thicken under the pointer. The pointer is spring-smoothed so it trails, not snaps.
 */
export function AsciiField({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const field = useMemo(() => makeFieldScene(clearZone), []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const host = wrap?.parentElement;
    if (!wrap || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const target = { x: 0.5, y: 0.5, strength: 0 };
    const state = { x: 0.5, y: 0.5, vx: 0, vy: 0, strength: 0 };
    let frame = 0;
    let last = performance.now();

    const onMove = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      target.x = (e.clientX - rect.left) / rect.width;
      target.y = (e.clientY - rect.top) / rect.height;
      target.strength = 1;
    };
    const onLeave = () => {
      target.strength = 0;
    };

    // Critically damped spring toward the pointer.
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const stiffness = 90;
      const damping = 2 * Math.sqrt(stiffness);
      state.vx += (stiffness * (target.x - state.x) - damping * state.vx) * dt;
      state.vy += (stiffness * (target.y - state.y) - damping * state.vy) * dt;
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      state.strength += (target.strength - state.strength) * Math.min(1, dt * 4);
      field.setPointer({ x: state.x, y: state.y, strength: state.strength });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [field]);

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("pointer-events-none", className)}>
      <AsciiCanvas scene={field.scene} fontSize={13} lineHeight={20} fps={20} tones={FIELD_TONES} ramp=" ·.:+×#" stillTime={4} />
    </div>
  );
}

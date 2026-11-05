"use client";

import { useEffect, useRef } from "react";

const COUNT_MS = 900;

function show(value: number, decimals: number, suffix: string) {
  return `${value.toFixed(decimals)}${suffix}`;
}

/** A number that counts up from zero the first time, and is just the number after that. */
export function CountUp({ value, decimals = 0, suffix = "", animate }: { value: number; decimals?: number; suffix?: string; animate: boolean }) {
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = show(value, decimals, suffix);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - start) / COUNT_MS);
      node.textContent = show(value * (1 - (1 - p) ** 4), decimals, suffix);
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animate, value, decimals, suffix]);

  return (
    <>
      <span className="sr-only">{show(value, decimals, suffix)}</span>
      <span ref={el} aria-hidden="true" className="tabular-nums">
        {show(animate ? 0 : value, decimals, suffix)}
      </span>
    </>
  );
}

/** Marks this account's first view as done, once the numbers have started. A cookie, so the server knows: no zero flashes on a return visit. */
export function CountedOnce({ cookie, userId }: { cookie: string; userId: string }) {
  useEffect(() => {
    document.cookie = `${cookie}=${encodeURIComponent(userId)}; path=/dashboard; max-age=31536000; samesite=lax`;
  }, [cookie, userId]);
  return null;
}

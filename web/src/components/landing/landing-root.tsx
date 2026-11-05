"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { PALETTES, paletteVars, type Daypart } from "@/lib/daypart";

/**
 * The landing page's root. Each [data-rv] part rises in once as it scrolls into view, in reading order; parts
 * are hidden only after this has run (data-ready), so the page reads in full without script. It carries the local-time
 * palette too: the browser's fallback script and DaypartGreeting repaint this element, hence suppressHydrationWarning.
 */
export function LandingRoot({ daypart, children }: { daypart: Daypart; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = "";
          io.unobserve(entry.target);
        }
      },
      // The huge top margin counts everything above the viewport as seen, so jumping down the page never leaves
      // a section hidden behind you.
      { rootMargin: "100000px 0px -12% 0px" },
    );
    root.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
    root.dataset.ready = "";
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="lp"
      data-daypart={daypart}
      data-ground={PALETTES[daypart].ground}
      style={paletteVars(daypart) as CSSProperties}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}

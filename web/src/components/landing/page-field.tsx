"use client";

import { useEffect, useRef } from "react";
import { useMotionPaused } from "@/lib/motion";

/**
 * The continuous palette field under the landing page (see .field in globals.css). It also brings each
 * [data-rv] part in once as it scrolls into view; parts stay visible if this never runs.
 */
export function PageField({ children }: { children: React.ReactNode }) {
  const paused = useMotionPaused();
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
      // The huge top margin counts everything already scrolled past as seen, so a jump down the page never leaves
      // a section hidden above the viewport.
      { rootMargin: "100000px 0px -10% 0px" },
    );
    root.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
    root.dataset.ready = "";
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="field" data-motion={paused ? "paused" : undefined}>
      {children}
    </div>
  );
}

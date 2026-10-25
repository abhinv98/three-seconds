"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AsciiGL } from "@/components/ascii/ascii-gl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { setMotionPaused, useMotionPaused } from "@/lib/motion";
import { usePageBackground } from "@/lib/use-page-background";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { createTerrainPainter, DUSK, FEED_RAMP, NIGHT_WASH, PEAKS } from "./terrain";

// Lavender Steel deepening to night above, Blossom Vapor at the horizon: dark enough behind the copy for white text.
const SKY: [string, string, string] = ["#1b1d4a", "#6f74b6", "#ffd3e6"];
const SKY_STOPS: [number, number] = [0.5, 0.78];

const HERO_CELL = (width: number) => (width < 640 ? { w: 5, h: 9 } : { w: 6, h: 11 });
const BUBBLE_GAP = 14; // px between the summit and the bubble's tail

/**
 * A drone flight over mountains of ASCII. Questions pop up over the summits it passes,
 * until one of them is the brand.
 */
export function Hero() {
  const reduced = useReducedMotion();
  const paused = useMotionPaused();
  const pageBackground = usePageBackground();
  const [terrain] = useState(() => createTerrainPainter({ palette: DUSK, mode: "flight" }));
  const sectionRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const popupRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    terrain.setNear(pageBackground);
  }, [terrain, pageBackground]);

  // Each frame: read the summits' screen positions, then place the bubbles (reads first, writes after).
  useEffect(() => {
    const section = sectionRef.current;
    const copy = copyRef.current;
    if (!section || !copy) return;
    const shown = PEAKS.map(() => false);
    // A bubble changes state only after its summit has been in (or out of) view for a few frames.
    const streak = PEAKS.map(() => 0);
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const box = section.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= window.innerHeight) return;
      const leave = Math.min(1, Math.max(0, -box.top / Math.max(1, box.height)));
      terrain.setScroll(Math.round(leave * 400) / 400);
      const snap = terrain.snapshot();
      const cw = box.width / snap.cols;
      const ch = box.height / snap.rows;
      // The headline, the paragraph and the buttons each keep their own box clear.
      const keepOut = Array.from(copy.children, (child) => {
        const r = child.getBoundingClientRect();
        const right = child.tagName === "H1" ? r.right : r.left + Math.min(r.width, (child as HTMLElement).scrollWidth);
        return { left: r.left - box.left - 16, right: right - box.left + 16, top: r.top - box.top - 16, bottom: r.bottom - box.top + 16 };
      });
      const sizes = popupRefs.current.map((el) => {
        const bubble = el?.firstElementChild?.nextElementSibling as HTMLElement | null | undefined;
        return { w: bubble?.offsetWidth ?? 0, h: bubble?.offsetHeight ?? 0 };
      });

      // Nearer bubbles claim their space first; a farther one that would overlap waits its turn.
      const taken: { left: number; right: number; top: number; bottom: number }[] = [];
      const order = snap.popups.map((_, i) => i).sort((a, b) => snap.popups[b].scale - snap.popups[a].scale);
      order.forEach((i) => {
        const popup = snap.popups[i];
        const el = popupRefs.current[i];
        if (!el) return;
        const x = popup.x * cw;
        const y = popup.y * ch;
        const s = popup.scale;
        const w = sizes[i].w * s;
        const h = (sizes[i].h + BUBBLE_GAP) * s;
        // Keep the bubble on screen; its tail stays over the summit.
        const left = Math.min(Math.max(x - w / 2, 12), box.width - 12 - w);
        const shift = (left + w / 2 - x) / s;
        const overCopy = keepOut.some((r) => left < r.right && left + w > r.left && y - h < r.bottom && y > r.top);
        const clash = taken.some((r) => left < r.right + 8 && left + w > r.left - 8 && y - h < r.bottom + 8 && y > r.top - 8);
        const want = popup.visible && !overCopy && !clash && leave < 0.45;
        if (want) taken.push({ left, right: left + w, top: y - h, bottom: y });
        streak[i] = want === shown[i] ? 0 : streak[i] + 1;
        if (streak[i] >= 5) {
          shown[i] = want;
          streak[i] = 0;
          el.dataset.show = want ? "true" : "false";
        }
        if (!popup.visible) return;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        el.style.setProperty("--shift", `${shift.toFixed(1)}px`);
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [terrain]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="hero-heading"
      className="relative isolate h-[100svh] min-h-[640px] overflow-hidden bg-[linear-gradient(180deg,#1b1d4a_0%,#6f74b6_50%,#ffd3e6_78%,var(--background)_100%)] text-[#f5f6ff]"
    >
      <div className="absolute inset-0">
        <AsciiGL
          paint={terrain.paint}
          version={terrain.revision}
          sun={terrain.sun}
          sunColor={DUSK.sun}
          sky={SKY}
          skyStops={SKY_STOPS}
          ramp={FEED_RAMP}
          background={NIGHT_WASH}
          cell={HERO_CELL}
          fill={0.36}
          gain={1.08}
          dither={0.12}
          stillTime={1}
          className="absolute inset-0"
        />

        {PEAKS.map((peak, i) => (
          <div
            key={peak.text}
            ref={(el) => {
              popupRefs.current[i] = el;
            }}
            data-show="false"
            data-found={peak.found || undefined}
            aria-hidden="true"
            className="peak-popup"
          >
            <span className="peak-pin" />
            <div className="peak-bubble">
              {peak.found ? (
                <>
                  <span className="peak-brackets">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  {peak.text}
                  <span className="ml-2 font-mono text-[11px] font-medium opacity-75">Saanjh Skin · 00:03.0</span>
                </>
              ) : (
                peak.text
              )}
              <span className="peak-tail" />
            </div>
          </div>
        ))}
      </div>

      <div className="relative mx-auto h-full max-w-[1200px] px-4 pt-[6.25rem] sm:px-6 sm:pt-[clamp(6.5rem,15vh,9rem)]">
        <div ref={copyRef} className="hero-rise max-w-[860px]">
          <h1
            id="hero-heading"
            className="text-[clamp(2.3rem,5.2vw,4.5rem)] leading-[1] font-bold tracking-[-0.035em] text-balance"
          >
            Where&apos;s your brand?
            <span className="block text-[#c3c8f0]">We find it, frame by frame.</span>
          </h1>
          <p className="mt-5 max-w-[48ch] text-[16px] leading-[26px] text-pretty text-[#eceeff] sm:mt-6 sm:text-[18px] sm:leading-[30px]">
            Drop in a creator&apos;s Reel. Three Seconds tracks your brand, times the disclosure label and makes the
            call against the ASCI guidelines, before the post goes live.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 sm:mt-8">
            <Button asChild variant="brand" size="lg" className="btn-sheen">
              <Link href="/check">
                Check an ad
                <Icon name="arrow-right" size={18} />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/report/sample">
                <Icon name="play" size={18} />
                <span className="sm:hidden">Sample report</span>
                <span className="hidden sm:inline">See a sample report</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Settles the last row of glyphs exactly on the page colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-[linear-gradient(180deg,transparent,var(--background))]"
      />

      {!reduced && (
        <button
          type="button"
          onClick={() => setMotionPaused(!paused)}
          aria-pressed={paused}
          className={cn(
            "absolute right-4 bottom-[max(14vh,96px)] z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium",
            "bg-[#14163a]/70 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors duration-150 hover:bg-[#14163a]/85 sm:right-6",
          )}
        >
          <Icon name={paused ? "play" : "pause"} size={14} />
          {paused ? "Play the flight" : "Pause the flight"}
        </button>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { AsciiGL } from "@/components/ascii/ascii-gl";
import { Logo } from "@/components/logo";
import { HeroDropBar } from "./hero-drop-bar";
import { createTerrainPainter, DUSK, FEED_RAMP, NIGHT_WASH, OVERFLY_HORIZON } from "./terrain";

// The range again at dusk, the drone flying straight ahead high over the summits toward the sun. The sky starts on
// the footer's night blue, so the canvas has no edge, and the foreground dissolves into night under the last line.
const RANGE_SKY: [string, string, string] = ["#1b1d4a", "#3a3d7c", "#ffd3e6"];
const RANGE_STOPS: [number, number] = [0.3, OVERFLY_HORIZON + 0.06];
const RANGE_PALETTE = { ...DUSK, near: NIGHT_WASH };
const RANGE_CELL = (width: number) => (width < 640 ? { w: 5, h: 9 } : { w: 6, h: 11 });

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/check", label: "Check an ad" },
      { href: "/report/sample", label: "Sample report" },
      { href: "#checks", label: "The four checks" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "The rules",
    links: [
      { href: "#call", label: "How a call is made" },
      { href: "#faq", label: "Why clauses read ASCI-PENDING" },
      { href: "#faq", label: "Where your video goes" },
    ],
  },
];

export function LandingFooter() {
  const [range] = useState(() => createTerrainPainter({ palette: RANGE_PALETTE, mode: "overfly" }));

  return (
    <footer
      aria-labelledby="footer-heading"
      className="footer-sky relative isolate overflow-hidden text-[#f5f6ff] [--range-h:clamp(560px,60vw,860px)]"
    >
      {/* The flight sits behind the footer's lower part; its top fades into the night blue above it. */}
      <div className="absolute inset-x-0 bottom-0 h-(--range-h) [mask-image:linear-gradient(transparent,black_140px)]">
        <AsciiGL
          paint={range.paint}
          version={range.revision}
          sun={range.sun}
          sunColor={DUSK.sun}
          sky={RANGE_SKY}
          skyStops={RANGE_STOPS}
          ramp={FEED_RAMP}
          background={NIGHT_WASH}
          cell={RANGE_CELL}
          fill={0.36}
          gain={1.08}
          dither={0.12}
          stillTime={6}
          className="absolute inset-0"
        />
      </div>

      <div className="relative">
        <div className="mx-auto max-w-[1200px] px-4 pt-[clamp(11rem,24vw,17rem)] sm:px-6">
          <h2
            id="footer-heading"
            data-rv="0"
            className="max-w-[14ch] text-[clamp(2.6rem,6.2vw,5rem)] leading-[0.98] font-bold tracking-[-0.035em] text-balance"
          >
            Post it once.
            <span className="block text-[#c3c8f0]">Post it right.</span>
          </h2>
          <p data-rv="1" className="mt-6 max-w-[46ch] text-[17px] leading-7 text-pretty text-[#eceeff]">
            Check the Reel before it goes live. Every verdict comes with its evidence: what was on screen, when, and for
            how long.
          </p>
          <div data-rv="2" className="mt-8 max-w-[600px] text-foreground">
            <HeroDropBar />
          </div>

          <div data-rv="3" className="mt-20 grid gap-10 border-t border-white/15 pt-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
            <div>
              <Logo size={22} />
              <p className="ts-body-sm mt-4 max-w-[36ch] text-pretty text-[#e6e8ff]">
                Checked against the ASCI influencer guidelines. Three Seconds shows its evidence; it does not give legal
                advice.
              </p>
            </div>
            {COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h3 className="ts-body-sm font-semibold text-[#c3c8f0]">{column.title}</h3>
                <ul className="mt-3 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="ts-body-sm -mx-1 inline-block rounded-sm px-1 py-1 text-white/90 transition-colors duration-150 hover:text-white hover:underline hover:decoration-white/40 hover:underline-offset-4"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div>
              <h3 className="ts-body-sm font-semibold text-[#c3c8f0]">Made for</h3>
              <p className="ts-body-sm mt-4 text-pretty text-white/90">
                The Meta Global AI Developer Hackathon 2026, Indie track.
              </p>
            </div>
          </div>
        </div>
        {/* Room for the range under the links; the last line sits on the ground as it dissolves into night. */}
        <div className="h-[calc(var(--range-h)*0.6)]" />
        <div className="ts-caption mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 pt-2 pb-8 text-white/75 sm:px-6">
          <span>© 2026 Three Seconds</span>
          <span>Not legal advice. Clauses read ASCI-PENDING until verified.</span>
        </div>
      </div>
    </footer>
  );
}

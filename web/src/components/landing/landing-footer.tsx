"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AsciiGL } from "@/components/ascii/ascii-gl";
import { Logo } from "@/components/logo";
import { usePageBackground } from "@/lib/use-page-background";
import { HeroDropBar } from "./hero-drop-bar";
import { createTerrainPainter, DUSK, FEED_RAMP, NIGHT_WASH } from "./terrain";

// The range again at dusk's last light, seen from high up, drifting sideways. Its sky picks up exactly where the
// footer's gradient ends.
const RANGE_SKY: [string, string, string] = ["#6f74b6", "#e6b6d6", "#ffd3e6"];
const RANGE_STOPS: [number, number] = [0.3, 0.55];
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
  const pageBackground = usePageBackground();
  const [range] = useState(() => createTerrainPainter({ palette: DUSK, mode: "panorama" }));
  useEffect(() => {
    range.setNear(pageBackground);
  }, [range, pageBackground]);

  return (
    <footer aria-labelledby="footer-heading" className="relative isolate overflow-hidden text-[#f5f6ff]">
      <div className="footer-sky">
        <div className="mx-auto max-w-[1200px] px-4 pt-[clamp(10rem,22vw,15rem)] sm:px-6">
          <h2
            id="footer-heading"
            className="max-w-[14ch] text-[clamp(2.6rem,6.2vw,5rem)] leading-[0.98] font-bold tracking-[-0.035em] text-balance"
          >
            Post it once.
            <span className="block text-[#c3c8f0]">Post it right.</span>
          </h2>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-7 text-pretty text-[#eceeff]">
            Check the Reel before it goes live. Every verdict comes with its evidence: what was on screen, when, and for
            how long.
          </p>
          <div className="mt-8 max-w-[600px] text-foreground">
            <HeroDropBar />
          </div>

          <div className="mt-20 grid gap-10 border-t border-white/15 pt-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
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
        <div className="relative mt-12 h-[clamp(200px,26vw,360px)] bg-[linear-gradient(180deg,#6f74b6_0%,#e6b6d6_30%,#ffd3e6_55%,var(--background)_100%)]">
          <AsciiGL
            paint={range.paint}
            version={range.revision}
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
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-[linear-gradient(180deg,transparent,var(--background))]"
          />
        </div>
      </div>
      <div className="bg-background text-muted-foreground">
        <div className="ts-caption mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 pt-2 pb-8 sm:px-6">
          <span>© 2026 Three Seconds</span>
          <span>Not legal advice. Clauses read ASCI-PENDING until verified.</span>
        </div>
      </div>
    </footer>
  );
}

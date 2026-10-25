"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AsciiCanvas } from "@/components/ascii/ascii-canvas";
import { makeMarkScene } from "@/components/ascii/scenes";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";

const MARK_TONES: [string, string, string, string] = ["--foreground", "--muted-foreground", "--brand", "--border"];

/** The close: the mark itself, drawn in characters and scanned by the playhead. */
export function FinalCta() {
  const scene = useMemo(() => makeMarkScene(), []);
  return (
    <section aria-labelledby="cta-heading" className="relative overflow-hidden border-t border-border">
      <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 id="cta-heading" className="text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-extrabold tracking-[-0.025em] text-balance">
            Check the next one before it goes live.
          </h2>
          <p className="ts-body mt-5 max-w-[44ch] text-pretty text-muted-foreground lg:text-[17px] lg:leading-7">
            One upload. A verdict, the measured evidence and the exact fix, before the Reel goes anywhere.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="brand" size="lg" className="btn-sheen">
              <Link href="/check">
                Check an ad
                <Icon name="arrow-right" size={18} />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/report/sample">
                <Icon name="play" size={18} />
                See a sample report
              </Link>
            </Button>
          </div>
        </div>
        <div aria-hidden="true" className="mx-auto aspect-[26/24] w-full max-w-[520px]">
          <AsciiCanvas scene={scene} fontSize={11} lineHeight={12} fps={20} tones={MARK_TONES} stillTime={1} ramp=" .:-=+*#%@" />
        </div>
      </div>
    </section>
  );
}

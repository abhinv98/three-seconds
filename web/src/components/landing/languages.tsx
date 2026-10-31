"use client";

import { useEffect, useState } from "react";
import { useMotionPaused } from "@/lib/motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

const LINES = [
  { lang: "hi-Deva", tag: "hi-Deva", name: "Hindi", text: "ये वीडियो एक पेड पार्टनरशिप है", deva: true },
  { lang: "hi-Latn", tag: "hi-Latn", name: "Hinglish", text: "Yeh video ek paid partnership hai.", deva: false },
  { lang: "en", tag: "en", name: "English", text: "This video is a paid partnership.", deva: false },
];

/** One disclosure in three ways of saying it; the playhead wash moves through them. */
export function Languages() {
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % LINES.length), 2400);
    return () => window.clearInterval(id);
  }, [paused, reduced]);

  return (
    <section aria-labelledby="lang-heading" className="field-zone field-lang">
      <div className="section-y mx-auto grid max-w-[1200px] gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
        <div data-rv="0">
          <h2 id="lang-heading" className="h-section">
            Hears it
            <span className="block text-muted-foreground">the way it&apos;s said.</span>
          </h2>
          <p className="ts-body mt-6 max-w-[46ch] text-pretty text-foreground/80 lg:text-[17px] lg:leading-7">
            Indian Reels switch languages mid-sentence. Three Seconds keeps Hindi in Devanagari and Hinglish in Latin
            script, exactly as spoken, and tags every line so a reviewer knows what was heard.
          </p>
        </div>
        <ol data-rv="1" className="divide-y divide-border border-y border-border" aria-label="One disclosure, three ways">
          {LINES.map((line, i) => (
            <li key={line.tag} className="relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-5 sm:py-6">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-y-2 -left-3 -right-3 -z-10 rounded-[12px] bg-brand-surface transition-[opacity,transform] duration-500 ease-[var(--ease-out)]",
                  active === i ? "scale-100 opacity-100" : "scale-[0.98] opacity-0",
                )}
              />
              <p
                lang={line.lang}
                className={cn(
                  "font-bold text-pretty",
                  line.deva ? "text-[clamp(1.6rem,3.4vw,2.6rem)] leading-[1.35]" : "text-[clamp(1.5rem,3.2vw,2.4rem)] leading-tight",
                )}
              >
                {line.text}
              </p>
              <span className="flex flex-col items-end gap-1 font-mono text-[12px] leading-4">
                <span className="rounded-[4px] border border-input px-1.5 py-0.5">{line.tag}</span>
                <span className="text-muted-foreground">{line.name}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

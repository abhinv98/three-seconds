"use client";

import { useEffect, useState } from "react";
import { AsciiCanvas } from "@/components/ascii/ascii-canvas";
import { holdScene, isLabelVisible, reelScene, SPOKEN_AT, waveScene } from "@/components/ascii/scenes";
import { StatusBadge, type Status } from "@/components/status-badge";
import { formatTimecode } from "@/lib/format";
import { useMotionPaused } from "@/lib/motion";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

const PLATE_TONES: [string, string, string, string] = ["--viewer-plate-foreground", "--stone-400", "--brand", "--ink-700"];
const LABEL_LOOP = 2.8;

/** Poster frame after the filatov.design sheets: title, mono metadata, the picture, then the rule. */
function Poster({
  title,
  check,
  model,
  status,
  rule,
  children,
  className,
}: {
  title: string;
  check: string;
  model: string;
  status: Status;
  rule: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("flex flex-col rounded-[16px] border border-border bg-card p-5 sm:p-6", className)}>
      <header className="flex items-start justify-between gap-4">
        <h3 className="text-[26px] leading-[30px] font-semibold tracking-[-0.01em] text-balance">{title}</h3>
        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 font-mono text-[11px] leading-4 text-muted-foreground">
          <dt>check</dt>
          <dd className="text-foreground">{check}</dd>
          <dt>model</dt>
          <dd className="text-foreground">{model}</dd>
        </dl>
      </header>
      <div className="my-5 flex min-h-48 flex-1 items-center justify-center">{children}</div>
      <footer className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 border-t border-border pt-4">
        <span className="font-mono text-[11px] leading-5 text-muted-foreground">Rule</span>
        <p className="ts-body-sm text-pretty">{rule}</p>
        <span className="font-mono text-[11px] leading-6 text-muted-foreground">Sample</span>
        <StatusBadge status={status} />
      </footer>
    </article>
  );
}

/** The opening seconds of the sample Reel, looping, with the label locked in a bracket. */
function LabelMoment() {
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const [t, setT] = useState(1.2);
  useEffect(() => {
    if (paused || reduced) return;
    const started = performance.now();
    const id = window.setInterval(() => setT(((performance.now() - started) / 1000) % LABEL_LOOP), 100);
    return () => window.clearInterval(id);
  }, [paused, reduced]);
  const on = isLabelVisible(t);
  return (
    <div className="@container relative aspect-[9/16] w-40 overflow-hidden rounded-[14px] bg-viewer-plate sm:w-44">
      <AsciiCanvas scene={reelScene} clock={() => t} stillTime={1.2} fontSize={5} lineHeight={6} tones={PLATE_TONES} />
      <span className="absolute top-[3.4%] left-[5%] text-[5.5cqw] leading-tight text-viewer-plate-foreground">
        <span className="block font-bold">meera.glows</span>
        <span className={cn("relative block transition-opacity duration-150", on ? "opacity-100" : "opacity-0")}>
          Paid partnership
          {on && (
            <span aria-hidden="true" className="lock-on absolute -inset-x-[2cqw] -inset-y-[1.4cqw] rounded-[3px] ring-2 ring-brand" />
          )}
        </span>
      </span>
      <span className="absolute right-[5%] bottom-[4%] rounded-[4px] bg-black/60 px-[2.5cqw] py-[1.2cqw] font-mono text-[5cqw] leading-none text-viewer-plate-foreground tabular-nums">
        {formatTimecode(t)}
      </span>
    </div>
  );
}

/** "Paid partnership" in the label's language, then in the language spoken. */
function LanguageSwap() {
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const [hindi, setHindi] = useState(false);
  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setInterval(() => setHindi((h) => !h), 2600);
    return () => window.clearInterval(id);
  }, [paused, reduced]);
  return (
    <div className="w-full">
      <div className="grid">
        <p
          lang="en"
          className={cn(
            "col-start-1 row-start-1 text-[clamp(2rem,4.4vw,3.25rem)] leading-tight font-extrabold tracking-[-0.01em] transition-[opacity,filter,transform] duration-500 ease-[var(--ease-out)]",
            hindi ? "translate-y-1 opacity-0 blur-[6px]" : "opacity-100 blur-0",
          )}
        >
          Paid partnership
        </p>
        <p
          lang="hi-Deva"
          className={cn(
            "col-start-1 row-start-1 text-[clamp(2rem,4.4vw,3.25rem)] leading-tight font-extrabold transition-[opacity,filter,transform] duration-500 ease-[var(--ease-out)]",
            hindi ? "opacity-100 blur-0" : "-translate-y-1 opacity-0 blur-[6px]",
          )}
        >
          सशुल्क साझेदारी
        </p>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 font-mono text-[12px] leading-5">
        <dt className="text-muted-foreground">label</dt>
        <dd>
          <span className="rounded-[4px] bg-muted px-1.5 py-0.5">en</span>
        </dd>
        <dt className="text-muted-foreground">speech</dt>
        <dd>
          <span className="rounded-[4px] bg-brand-surface px-1.5 py-0.5 text-brand-text">hi-Latn</span>
          <span className="ml-2 text-muted-foreground">mostly Hinglish</span>
        </dd>
      </dl>
    </div>
  );
}

export function CheckPosters() {
  return (
    <div className="grid gap-4 md:grid-cols-12 md:gap-5">
      <Poster
        className="md:col-span-7"
        title="Label hold"
        check="label_duration"
        model="SAM 3.1"
        status="fail"
        rule="How long the disclosure label stays on screen, measured to a tenth of a second against the whole video and every brand appearance."
      >
        <div className="w-full">
          <div className="h-28 w-full sm:h-32">
            <AsciiCanvas scene={holdScene} fontSize={14} lineHeight={16} stillTime={6} ramp=" .·:=#█" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] leading-4 text-muted-foreground">
            <span>00:00.0</span>
            <span className="hidden items-center gap-3 sm:flex">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-foreground" aria-hidden="true" />
                label on screen
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-0.5 bg-brand" aria-hidden="true" />
                playhead
              </span>
            </span>
            <span>00:28.0</span>
          </div>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="ts-readout">1.8s</span>
            <span className="font-mono text-[13px] text-muted-foreground">held, of 28.0s · gone before the brand at 00:03.0</span>
          </p>
        </div>
      </Poster>
      <Poster
        className="md:col-span-5"
        title="Label on screen"
        check="label_present"
        model="SAM 3.1"
        status="pass"
        rule="Whether a disclosure such as “Paid partnership” or #ad appears on screen at all, and where."
      >
        <LabelMoment />
      </Poster>
      <Poster
        className="md:col-span-5"
        title="Spoken disclosure"
        check="spoken_disclosure"
        model="Muse Voice Transcribe"
        status="pass"
        rule="Whether the creator says it out loud, in Hindi, Hinglish or English, and exactly when."
      >
        <div className="w-full">
          <div className="h-28 w-full">
            <AsciiCanvas scene={waveScene} fontSize={10} lineHeight={8} stillTime={6.5} ramp=" .:|" />
          </div>
          <p className="mt-3 ts-body-sm">
            <span className="rounded-xs bg-brand-surface px-1">&ldquo;Yeh video sponsored hai.&rdquo;</span>
            <span className="ml-2 font-mono text-[12px] text-muted-foreground">
              {formatTimecode(SPOKEN_AT?.t_start ?? 21)} · hi-Latn
            </span>
          </p>
        </div>
      </Poster>
      <Poster
        className="md:col-span-7"
        title="Label language"
        check="label_language"
        model="Muse Spark"
        status="review"
        rule="Whether the label is in the language the audience hears. A Hinglish Reel with an English-only label needs a second look."
      >
        <LanguageSwap />
      </Poster>
    </div>
  );
}

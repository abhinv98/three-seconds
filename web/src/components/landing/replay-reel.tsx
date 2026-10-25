"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiCanvas } from "@/components/ascii/ascii-canvas";
import {
  isLabelVisible,
  productBox,
  reelScene,
  SPOKEN_AT,
  STORY_DURATION,
} from "@/components/ascii/scenes";
import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { Timeline, type TimelineLane } from "@/components/timeline";
import { formatTimecode } from "@/lib/format";
import { SAMPLE_REPORT } from "@/lib/mock";
import { setMotionPaused, useMotionPaused } from "@/lib/motion";
import { spokenMarkers } from "@/lib/summary";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

const PLAY_SECONDS = 9.5; // real seconds for the 28 s story
const HOLD_SECONDS = 2.4; // the verdict stays up before the loop restarts
const STILL = 1.3; // first frame, and the reduced-motion frame: label on screen, tracked
const STAMP_FROM = 27.2;
const PLATE_TONES: [string, string, string, string] = [
  "--viewer-plate-foreground",
  "--stone-400",
  "--brand",
  "--ink-700",
];

const LANES: TimelineLane[] = SAMPLE_REPORT.tracks.map((track, i) => ({
  id: `${track.kind}-${i}`,
  name: track.kind === "disclosure_label" ? "Label" : "Brand",
  description: track.label,
  segments: track.spans,
}));
const MARKERS = { name: "Spoken", description: "Spoken disclosure", items: spokenMarkers(SAMPLE_REPORT) };
const SPOKEN = { start: SPOKEN_AT?.t_start ?? 21, end: SPOKEN_AT?.t_end ?? 22.4 };

/** A tracking bracket: four orange corners and a model tag, locking on when it appears. */
function Bracket({
  tag,
  tagSide = "top",
  className,
  style,
}: {
  tag: string;
  tagSide?: "top" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  const corner = "absolute size-[3cqw] border-brand";
  return (
    <span aria-hidden="true" className={cn("lock-on pointer-events-none absolute", className)} style={style}>
      <span className={cn(corner, "top-0 left-0 rounded-tl-[3px] border-t-2 border-l-2")} />
      <span className={cn(corner, "top-0 right-0 rounded-tr-[3px] border-t-2 border-r-2")} />
      <span className={cn(corner, "bottom-0 left-0 rounded-bl-[3px] border-b-2 border-l-2")} />
      <span className={cn(corner, "right-0 bottom-0 rounded-br-[3px] border-r-2 border-b-2")} />
      <span
        className={cn(
          "absolute rounded-[3px] bg-brand px-[1.4cqw] py-[0.5cqw] font-mono text-[2.7cqw] leading-none font-medium whitespace-nowrap text-brand-foreground",
          tagSide === "top" ? "bottom-full left-0 mb-[1cqw]" : "top-1/2 left-full ml-[1.6cqw] -translate-y-1/2",
        )}
      >
        {tag}
      </span>
    </span>
  );
}

const CALLOUTS = [
  { id: "track", model: "SAM 3.1", text: "Tracks the label and the brand, frame by frame.", top: "7%" },
  { id: "hear", model: "Muse Voice Transcribe", text: "Hears the disclosure, in Hinglish.", top: "62%" },
  { id: "call", model: "Muse Spark", text: "Calls it against the ASCI guideline.", top: "84%" },
] as const;

export function ReplayReel() {
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const [s, setS] = useState(STILL);
  const story = useRef(STILL);
  const figureRef = useRef<HTMLElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;
    const observer = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  // The story clock: 28 s of the sample Reel in about 9.5 s, a held verdict, then again.
  useEffect(() => {
    if (paused || reduced) return;
    let frame = 0;
    let last = performance.now();
    let hold = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible.current && !document.hidden) {
        if (hold > 0) {
          hold -= dt;
          if (hold <= 0) story.current = 0;
        } else {
          story.current += dt * (STORY_DURATION / PLAY_SECONDS);
          if (story.current >= STORY_DURATION) {
            story.current = STORY_DURATION;
            hold = HOLD_SECONDS;
          }
        }
        setS(story.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused, reduced]);

  const now = reduced ? STILL : s;
  const labelOn = isLabelVisible(now);
  const box = productBox(now);
  const line = SAMPLE_REPORT.transcript.find((seg) => now >= seg.t_start && now <= seg.t_end);
  const stamp = reduced || now >= STAMP_FROM;
  const disclosure = !stamp && now >= SPOKEN.start && now <= SPOKEN.end;
  const active = stamp ? "call" : disclosure ? "hear" : labelOn || box ? "track" : null;

  return (
    <figure ref={figureRef} className="relative w-full">
      <figcaption className="sr-only">
        Animated example of a check: the &ldquo;Paid partnership&rdquo; label is tracked for 1.8 seconds, the brand in three
        spans and a spoken disclosure at 00:21.0, and the verdict is Fail.
      </figcaption>

      <div className="flex items-start justify-center gap-6 xl:justify-start">
        {/* The Reel */}
        <div
          aria-hidden="true"
          className="@container relative aspect-[9/16] w-[min(340px,84vw)] shrink-0 overflow-hidden rounded-[22px] bg-viewer-plate shadow-[0_30px_80px_-30px_rgb(18_18_18/0.55)] ring-1 ring-black/10"
        >
          <AsciiCanvas
            scene={reelScene}
            clock={() => story.current}
            stillTime={STILL}
            fontSize={7}
            lineHeight={8}
            fps={30}
            tones={PLATE_TONES}
            ramp=" .·:-=+*x%#@"
            className="absolute inset-0"
          />

          {/* Reels header */}
          <div className="absolute top-[3.4%] left-[4.5%] flex items-center gap-[2.4cqw] text-viewer-plate-foreground">
            <span className="size-[9cqw] rounded-full border-[0.6cqw] border-brand bg-[var(--stone-500)]" />
            <span className="leading-tight">
              <span className="block text-[4cqw] font-bold">meera.glows</span>
              {labelOn && (
                <span className="relative block text-[3.3cqw]">
                  Paid partnership
                  <Bracket tag="SAM 3.1 · label" tagSide="right" className="-inset-x-[1.6cqw] -inset-y-[1cqw]" />
                </span>
              )}
            </span>
          </div>

          {/* Running timecode */}
          <span className="absolute top-[3.8%] right-[4.5%] flex items-center gap-[1.4cqw] rounded-[1.6cqw] bg-black/55 px-[2cqw] py-[1cqw] font-mono text-[3.2cqw] leading-none text-viewer-plate-foreground tabular-nums">
            <span className="size-[1.6cqw] rounded-full bg-brand" />
            {formatTimecode(now)}
          </span>

          {box && (
            <Bracket
              tag="brand · Saanjh Skin"
              style={{
                left: `${box.left * 100}%`,
                top: `${box.top * 100}%`,
                width: `${(box.right - box.left) * 100}%`,
                height: `${(box.bottom - box.top) * 100}%`,
              }}
            />
          )}

          {line && !stamp && (
            <span className="absolute inset-x-[7%] bottom-[11%] flex justify-center">
              <span className="relative rounded-[1.8cqw] bg-black/70 px-[2.6cqw] py-[1.4cqw] text-center text-[3.8cqw] leading-snug font-bold text-balance text-viewer-plate-foreground">
                {line.text}
                {disclosure && (
                  <Bracket tag="Muse Voice · hi-Latn" className="-inset-x-[1.6cqw] -inset-y-[1.4cqw]" />
                )}
              </span>
            </span>
          )}

          {stamp && (
            <div className="stamp-in absolute inset-x-[4.5%] bottom-[4.5%] rounded-[3.6cqw] bg-background p-[4cqw] text-foreground">
              <StatusBadge status="fail" tone="solid" />
              <p className="mt-[2.4cqw] text-[7cqw] leading-none font-extrabold tracking-[-0.01em]">Label held 1.8s.</p>
              <p className="mt-[1.8cqw] text-[3.5cqw] leading-snug text-muted-foreground">
                Gone before the brand appears at 00:03.0.
              </p>
            </div>
          )}
        </div>

        {/* Coach marks, x6sense style, lit as each model does its part */}
        <ol className="relative hidden h-[calc(min(340px,84vw)*16/9)] w-44 shrink-0 xl:block" aria-label="Models in the pipeline">
          {CALLOUTS.map((callout) => (
            <li
              key={callout.id}
              className={cn(
                "absolute left-0 w-full transition-[opacity,transform] duration-300 ease-[var(--ease-out)]",
                active === callout.id ? "translate-x-0 opacity-100" : "translate-x-1 opacity-45",
              )}
              style={{ top: callout.top }}
            >
              <span aria-hidden="true" className="absolute top-3 -left-6 h-px w-5 bg-input" />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[9px] -left-7 size-2 rounded-full",
                  active === callout.id ? "bg-brand" : "bg-input",
                )}
              />
              <div className="rounded-[10px] border border-border bg-popover px-3 py-2 text-popover-foreground">
                <p className="font-mono text-[11px] leading-4 font-medium text-brand-text">{callout.model}</p>
                <p className="ts-body-sm mt-0.5 text-pretty">{callout.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mx-auto mt-5 w-full max-w-[min(540px,100%)] xl:mx-0">
        <Timeline duration={STORY_DURATION} lanes={LANES} markers={MARKERS} playhead={now} summary="" />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="ts-caption text-muted-foreground">Sample Reel · 28.0s, played at 3×</p>
          {!reduced && (
            <button
              type="button"
              onClick={() => setMotionPaused(!paused)}
              aria-pressed={paused}
              className="ts-caption inline-flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name={paused ? "play" : "pause"} size={14} />
              {paused ? "Play animation" : "Pause animation"}
            </button>
          )}
        </div>
      </div>
    </figure>
  );
}

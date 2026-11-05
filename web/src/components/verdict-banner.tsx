"use client";

import { useEffect, useRef } from "react";
import { Icon, type IconName } from "@/components/icon";
import { Tick } from "@/components/landing/tick";
import { StatusBadge } from "@/components/status-badge";
import { TimecodeText } from "@/components/timecode-chip";
import { formatSeconds, formatTimecode } from "@/lib/format";
import { countByVerdict, verdictStatus, type Report, type Verdict } from "@/lib/report";
import { verdictHeadline } from "@/lib/summary";
import { cn } from "@/lib/utils";

const COUNT_STYLE: Record<Verdict, { icon: IconName; word: string; className: string }> = {
  FAIL: { icon: "cross", word: "fail", className: "text-fail-text" },
  REVIEW: { icon: "eye", word: "review", className: "text-review-text" },
  PASS: { icon: "check", word: "pass", className: "text-pass-text" },
};

const OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
// The stamp is a thing falling onto paper, so it speeds up until it lands. It's the one place that does.
const FALLING = "cubic-bezier(0.7, 0, 0.84, 0)";

/** Plays the stamp the first time this browser sees this Reel's verdict; after that it's just there. */
function playStamp(root: HTMLElement, revealKey: string) {
  const key = `ts-stamped:${revealKey}`;
  let seen = true;
  try {
    seen = localStorage.getItem(key) !== null;
    localStorage.setItem(key, "1");
  } catch {
    // No storage, no reveal: the verdict just shows.
  }
  root.dataset.reveal = "done";
  if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const stamp = root.querySelector<HTMLElement>("[data-stamp]");
  const ghost = root.querySelector<HTMLElement>("[data-stamp-ghost]");
  const landed = 150 + 210;
  stamp?.animate(
    [
      { opacity: 0, transform: "rotate(-11deg) scale(2.1)" },
      { opacity: 1, transform: "rotate(-3deg) scale(1)" },
    ],
    { duration: 210, delay: 150, easing: FALLING, fill: "backwards" },
  );
  ghost?.animate(
    [
      { opacity: 0.4, transform: "rotate(-3deg) scale(1)" },
      { opacity: 0, transform: "rotate(-3deg) scale(1.28)" },
    ],
    { duration: 320, delay: landed, easing: OUT },
  );
  root.animate([{ transform: "translateY(0)" }, { transform: "translateY(4px) scale(0.998)", offset: 0.22 }, { transform: "translateY(0)" }], { duration: 280, delay: landed, easing: OUT });
  root.querySelectorAll<HTMLElement>("[data-after-stamp]").forEach((el, i) => {
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 240, delay: landed + 60 + i * 60, easing: OUT, fill: "backwards" },
    );
  });
}

interface VerdictBannerProps {
  report: Report;
  onSeek?: (t: number) => void;
  /** With a Reel's id: the verdict stamps down the first time this browser sees it. */
  revealKey?: string;
}

/** Top of every report: the verdict stamp, the measured sentence, the readout. */
export function VerdictBanner({ report, onSeek, revealKey }: VerdictBannerProps) {
  const root = useRef<HTMLElement>(null);
  const { headline, note } = verdictHeadline(report);
  const counts = countByVerdict(report.checks);
  const label = report.tracks.find((t) => t.kind === "disclosure_label");
  const status = verdictStatus(report.verdict);

  useEffect(() => {
    if (revealKey && root.current) playStamp(root.current, revealKey);
  }, [revealKey]);

  return (
    <section ref={root} aria-labelledby="verdict-headline" data-reveal={revealKey ? "wait" : undefined} className="verdict-banner rounded-lg bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="sr-only">Overall verdict</p>
          <svg aria-hidden="true" width="0" height="0" className="absolute">
            <filter id="stamp-rough" x="-5%" y="-10%" width="110%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="wobble" />
              <feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.4" result="inked" />
              <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="9" result="grain" />
              <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.9" result="holes" />
              <feComposite in="inked" in2="holes" operator="in" />
            </filter>
          </svg>
          <div className="relative w-fit">
            <StatusBadge status={status} tone="stamp" size="stamp" data-stamp="" />
            <StatusBadge status={status} tone="stamp" size="stamp" data-stamp-ghost="" aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-0" />
          </div>
          <h1 id="verdict-headline" data-after-stamp="" className="ts-display mt-5 text-balance">
            {headline}
          </h1>
          {note && (
            <p data-after-stamp="" className="ts-body mt-2 max-w-[62ch] text-pretty text-muted-foreground">
              <TimecodeText text={note} onSeek={onSeek} />
            </p>
          )}
        </div>
        {label && (
          <div data-after-stamp="" className="flex shrink-0 items-center gap-4 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-1 sm:pl-6">
            <span className="hidden shrink-0 sm:block [&_canvas]:[image-rendering:pixelated]">
              <Tick size={84} mood={report.verdict === "PASS" ? "pass" : report.verdict === "FAIL" ? "fail" : "review"} lcd={`${Math.round(label.longest_continuous_s)}s`} />
            </span>
            <div className="sm:text-right">
              <p className="ts-readout">{formatSeconds(label.total_on_screen_s)}</p>
              <p className="ts-caption mt-1 text-muted-foreground">Label on screen, of {formatSeconds(report.video.duration_s)}</p>
            </div>
          </div>
        )}
      </div>

      <div data-after-stamp="" className="mt-5 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
        <ul className="ts-body-sm flex flex-wrap gap-x-5 gap-y-1" aria-label="Checks by verdict">
          {(Object.keys(COUNT_STYLE) as Verdict[]).map((verdict) => {
            const style = COUNT_STYLE[verdict];
            return (
              <li key={verdict} className={cn("inline-flex items-center gap-1.5", counts[verdict] ? style.className : "text-muted-foreground")}>
                <Icon name={style.icon} size={16} />
                <span className="font-semibold">{counts[verdict]}</span> {style.word}
              </li>
            );
          })}
        </ul>
        <p className="ts-body-sm flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="ts-code min-w-0 break-all text-foreground">{report.video.filename}</span>
          <span aria-hidden="true">·</span>
          <span className="ts-timecode">{formatTimecode(report.video.duration_s)}</span>
          <span aria-hidden="true">·</span>
          <span>Checked against ASCI influencer guidelines</span>
          {report.mock && <span className="ts-label rounded-sm border border-input px-1.5 py-0.5 text-muted-foreground">Sample data</span>}
        </p>
      </div>
    </section>
  );
}

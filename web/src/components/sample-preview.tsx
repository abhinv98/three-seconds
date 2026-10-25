"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";
import { SAMPLE_REPORT } from "@/lib/mock";
import { spokenMarkers } from "@/lib/summary";

const CHECKS: { icon: IconName; title: string; body: string }[] = [
  { icon: "tag", title: "Label on screen", body: "Is a disclosure such as “Paid partnership” visible?" },
  { icon: "clock", title: "Label hold", body: "How long it stays up, to a tenth of a second." },
  { icon: "mic", title: "Spoken disclosure", body: "Said out loud, in Hindi, Hinglish or English." },
  { icon: "chat", title: "Label language", body: "Whether the label matches the language spoken." },
];

/** Sweeps the playhead across the sample in real time; holds still under reduced motion. */
function useSweep(duration: number, rest: number) {
  const [t, setT] = useState(rest);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const startedAt = performance.now() - rest * 1000;
    const loop = (now: number) => {
      setT((((now - startedAt) / 1000) % duration + duration) % duration);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [duration, rest]);
  return t;
}

export function SamplePreview() {
  const report = SAMPLE_REPORT;
  const duration = report.video.duration_s;
  const playhead = useSweep(duration, 2.2);

  return (
    <div className="flex flex-col gap-8">
      <figure className="rounded-lg bg-card p-4 sm:p-6">
        <figcaption className="flex items-center justify-between gap-3">
          <span className="ts-label text-muted-foreground">Sample report</span>
          <span className="ts-code truncate text-muted-foreground">{report.video.filename}</span>
        </figcaption>
        <p className="sr-only">
          A sample report: Fail. Label held 1.8s and is gone before the brand appears. The timeline shows the label, the
          brand and a spoken disclosure.
        </p>
        <div aria-hidden="true" className="mt-5">
          <StatusBadge status="fail" tone="solid" />
          <p className="ts-headline mt-3">Label held 1.8s.</p>
          <p className="ts-body-sm mt-1 text-muted-foreground">Gone before the brand appears at 00:03.0.</p>
          <Timeline
            className="mt-5"
            duration={duration}
            playhead={playhead}
            summary=""
            lanes={report.tracks.map((track, i) => ({
              id: `${track.kind}-${i}`,
              name: track.kind === "disclosure_label" ? "Label" : "Brand",
              description: track.label,
              segments: track.spans,
            }))}
            markers={{ name: "Spoken", description: "Spoken disclosure", items: spokenMarkers(report) }}
          />
        </div>
      </figure>

      <section aria-labelledby="checks-list-heading">
        <h2 id="checks-list-heading" className="ts-title">
          What we check
        </h2>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {CHECKS.map((check) => (
            <li key={check.title} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-3">
              <Icon name={check.icon} size={20} className="mt-0.5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="ts-body font-semibold">{check.title}</p>
                <p className="ts-body-sm text-muted-foreground">{check.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FixCard } from "@/components/fix-card";
import { Icon } from "@/components/icon";
import { RuleCheckRow } from "@/components/rule-check-row";
import { Timeline, type TimelineLane } from "@/components/timeline";
import { Transcript } from "@/components/transcript";
import { Button } from "@/components/ui/button";
import { VerdictBanner } from "@/components/verdict-banner";
import { bySeverity, type Report } from "@/lib/report";
import { useStoredReport } from "@/lib/report-store";
import { spokenMarkers, timelineSummary } from "@/lib/summary";

export function ReportView({ id, report: given }: { id: string; report?: Report }) {
  const stored = useStoredReport(id);
  const report = given ?? stored;
  if (report === undefined) return <ReportSkeleton />;
  if (report === null) return <ReportMissing />;
  if (report.status === "error") return <ReportFailed />;
  return <ReportBody report={report} />;
}

function ReportBody({ report }: { report: Report }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const duration = report.video.duration_s;

  // Coarse time (about 4 updates a second) for chips and transcript; the timeline animates itself.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const read = () => setTime(video.currentTime);
    video.addEventListener("timeupdate", read);
    video.addEventListener("seeked", read);
    return () => {
      video.removeEventListener("timeupdate", read);
      video.removeEventListener("seeked", read);
    };
  }, []);

  const seek = useCallback(
    (t: number) => {
      const next = Math.min(Math.max(t, 0), duration);
      setTime(next);
      const video = videoRef.current;
      if (!video) return;
      try {
        video.currentTime = next;
      } catch {
        // Not seekable yet (metadata still loading); the state still moves.
      }
      const rect = video.getBoundingClientRect();
      if (rect.bottom < 64 || rect.top > window.innerHeight - 64) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        video.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }
    },
    [duration],
  );

  const lanes: TimelineLane[] = report.tracks.map((track, i) => ({
    id: `${track.kind}-${i}`,
    name: track.kind === "disclosure_label" ? "Label" : "Brand",
    description: track.label,
    segments: track.spans,
  }));
  const spoken = spokenMarkers(report);
  const checks = bySeverity(report.checks);

  return (
    <main id="main" className="mx-auto max-w-[1120px] px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <VerdictBanner report={report} onSeek={seek} />

      <div className="mt-6 grid gap-8 min-[900px]:mt-8 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10">
        <section aria-label="Video and timeline" className="min-w-0 min-[900px]:sticky min-[900px]:top-6 min-[900px]:self-start">
          <div className="relative flex h-[min(560px,68dvh)] items-center justify-center overflow-hidden rounded-lg bg-viewer-plate">
            {videoFailed ? (
              <div className="max-w-[28ch] px-6 text-center text-viewer-plate-foreground">
                <Icon name="film" size={24} className="mx-auto" />
                <p className="ts-body mt-3">The video can&apos;t be played in this tab.</p>
                <p className="ts-caption mt-1 opacity-80">
                  Local previews don&apos;t survive a reload. The report below is still complete.
                </p>
              </div>
            ) : (
              <video
                ref={videoRef}
                src={report.video.blob_url}
                controls
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
                className="h-full w-full object-contain"
                aria-label={`Video: ${report.video.filename}`}
              />
            )}
          </div>
          <Timeline
            className="mt-4"
            duration={duration}
            lanes={lanes}
            markers={{ name: "Spoken", description: "Spoken disclosure", items: spoken }}
            playhead={time}
            videoRef={videoRef}
            onSeek={seek}
            summary={timelineSummary(report)}
          />
          <p className="ts-caption mt-3 text-muted-foreground">
            Click a span or drag the ruler to seek. Arrow keys move 0.1s, Shift moves 1s.
          </p>
        </section>

        <div className="flex min-w-0 flex-col gap-10">
          <section aria-labelledby="checks-heading">
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <h2 id="checks-heading" className="ts-title">
                Checks
              </h2>
              <p className="ts-caption text-muted-foreground">{checks.length} rules, worst first</p>
            </div>
            <ol className="divide-y divide-border">
              {checks.map((check) => (
                <RuleCheckRow key={check.id} check={check} time={time} onSeek={seek} />
              ))}
            </ol>
          </section>

          <FixCard checks={report.checks} onSeek={seek} />

          <Transcript
            segments={report.transcript}
            audioChecked={report.audio_checked}
            disclosureTimes={spoken.map((m) => m.t)}
            time={time}
            onSeek={seek}
          />
        </div>
      </div>

      <ReportFooter report={report} />
    </main>
  );
}

function ReportFooter({ report }: { report: Report }) {
  const generated = new Date(report.generated_at);
  return (
    <footer className="mt-12 border-t border-border pt-6">
      {report.mock && (
        <p className="ts-body-sm flex items-start gap-2 text-foreground">
          <Icon name="info" size={16} className="mt-0.5" />
          Sample report, AI pipeline not connected yet.
        </p>
      )}
      <dl className="ts-caption mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1 text-muted-foreground">
        <dt>Models used</dt>
        <dd className="ts-code text-foreground">{report.models_used.join(" · ") || "None"}</dd>
        <dt>Report</dt>
        <dd className="ts-code break-all">{report.job_id}</dd>
        <dt>Generated</dt>
        <dd>
          {Number.isNaN(generated.getTime())
            ? report.generated_at
            : generated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </dd>
      </dl>
      <p className="ts-caption mt-3 text-muted-foreground">
        Checked against the ASCI influencer guidelines. This is not legal advice.
      </p>
    </footer>
  );
}

function ReportSkeleton() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-6 pb-16 sm:px-6 sm:pt-8" aria-busy="true" aria-label="Loading report">
      <div className="h-[220px] animate-pulse rounded-lg bg-card" />
      <div className="mt-8 grid gap-8 min-[900px]:grid-cols-[340px_minmax(0,1fr)] min-[900px]:gap-10">
        <div className="h-[min(560px,68dvh)] animate-pulse rounded-lg bg-muted" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-card" />
          ))}
        </div>
      </div>
    </main>
  );
}

function ReportMissing() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-16 pb-16 sm:px-6">
      <div className="max-w-xl">
        <h1 className="ts-headline">This report isn&apos;t in this tab</h1>
        <p className="ts-body mt-3 text-muted-foreground">
          For now, reports live only in the browser tab that ran the check. Run the check again to see it.
        </p>
        <Button asChild className="mt-6">
          <Link href="/check">
            <Icon name="upload" size={18} />
            Check a video
          </Link>
        </Button>
      </div>
    </main>
  );
}

function ReportFailed() {
  return (
    <main className="mx-auto max-w-[1120px] px-4 pt-16 pb-16 sm:px-6">
      <div className="max-w-xl">
        <h1 className="ts-headline">The check didn&apos;t finish</h1>
        <p className="ts-body mt-3 text-muted-foreground">
          Something went wrong while checking this video. Upload it again to retry.
        </p>
        <Button asChild className="mt-6">
          <Link href="/check">
            <Icon name="refresh" size={18} />
            Check again
          </Link>
        </Button>
      </div>
    </main>
  );
}

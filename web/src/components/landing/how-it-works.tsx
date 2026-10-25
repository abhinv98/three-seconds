import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { Timeline, type TimelineLane } from "@/components/timeline";
import { formatTimecode } from "@/lib/format";
import { SAMPLE_REPORT } from "@/lib/mock";
import { spokenMarkers } from "@/lib/summary";

const LANES: TimelineLane[] = SAMPLE_REPORT.tracks.map((track, i) => ({
  id: `${track.kind}-${i}`,
  name: track.kind === "disclosure_label" ? "Label" : "Brand",
  description: track.label,
  segments: track.spans,
}));
const MARKERS = { name: "Spoken", description: "Spoken disclosure", items: spokenMarkers(SAMPLE_REPORT) };
const RESULTS = [
  { status: "fail" as const, title: "Label held long enough", line: "Label held 1.8s." },
  { status: "review" as const, title: "Label language matches speech", line: "Label is in English. Speech is Hinglish." },
  { status: "pass" as const, title: "Spoken disclosure", line: "Said at 00:21.0." },
];

function Step({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col">
      <div className="flex min-h-64 flex-1 flex-col justify-center rounded-[16px] border border-border bg-card p-4 sm:p-5">
        {children}
      </div>
      <div className="mt-5 grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3">
        <span className="font-mono text-[13px] leading-[26px] text-brand-text">{n}</span>
        <div>
          <h3 className="ts-title">{title}</h3>
          <p className="ts-body mt-1.5 text-pretty text-muted-foreground">{body}</p>
        </div>
      </div>
    </li>
  );
}

/** The replay booth: the real product parts, rendered in Ink, in the order a check runs. */
export function HowItWorks() {
  const video = SAMPLE_REPORT.video;
  return (
    <section id="how" data-theme="dark" aria-labelledby="how-heading" className="scroll-mt-16 bg-viewer-plate text-foreground">
      <div className="mx-auto max-w-[1200px] px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <h2 id="how-heading" className="text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance">
            A replay booth for every Reel.
          </h2>
          <p className="ts-body max-w-[52ch] text-pretty text-muted-foreground lg:justify-self-end lg:text-[17px] lg:leading-7">
            Reviewers scrub frame by frame hunting for a disclosure that flashed past. Three Seconds does the scrubbing,
            shows every measurement, and cites the rule it checked.
          </p>
        </div>

        <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-6">
          <Step
            n="01"
            title="Upload the Reel"
            body="MP4 or MOV, up to 90 seconds. It goes straight from your browser to storage."
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-background">
                <Icon name="film" size={20} />
              </span>
              <div className="min-w-0">
                <p className="ts-code truncate">{video.filename}</p>
                <p className="ts-caption text-muted-foreground">
                  {formatTimecode(video.duration_s)} · {video.width}×{video.height} · Hinglish beauty Reel
                </p>
              </div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full rounded-full bg-primary" />
            </div>
            <p className="ts-caption mt-2 flex justify-between text-muted-foreground">
              <span>Uploaded</span>
              <span className="font-mono">100%</span>
            </p>
          </Step>

          <Step
            n="02"
            title="We measure it"
            body="SAM 3.1 tracks the label and the brand at 5 frames a second. Muse Voice Transcribe writes down what's said, in the script it was said in."
          >
            <Timeline duration={video.duration_s} lanes={LANES} markers={MARKERS} playhead={21} summary="" />
            <p className="ts-body-sm mt-4 flex flex-wrap items-center gap-2">
              <span className="ts-timecode rounded-sm border-[1.5px] border-input px-1.5 py-0.5">00:21.0</span>
              <span lang="hi-Latn">Yeh video sponsored hai.</span>
              <span className="font-mono text-[11px] text-muted-foreground">hi-Latn</span>
            </p>
          </Step>

          <Step
            n="03"
            title="We make the call"
            body="Muse Spark checks each rule and cites the clause. Every Fail and Review comes with the fix."
          >
            <ul className="divide-y divide-border">
              {RESULTS.map((result) => (
                <li key={result.title} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-2.5 first:pt-0">
                  <StatusBadge status={result.status} />
                  <div className="min-w-0">
                    <p className="ts-body-sm font-semibold">{result.title}</p>
                    <p className="ts-caption text-muted-foreground">{result.line}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-[10px] bg-brand-surface p-3">
              <p className="ts-body-sm font-semibold">Fix one thing before you post</p>
              <p className="ts-body-sm mt-1 text-pretty">
                Keep the label on screen while the brand is visible,{" "}
                <span className="ts-timecode rounded-sm border-[1.5px] border-input px-1">00:03.0</span> to{" "}
                <span className="ts-timecode rounded-sm border-[1.5px] border-input px-1">00:27.0</span>.
              </p>
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}

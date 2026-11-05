"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { textColourOn } from "@/app/dashboard/tools/label";
import { when } from "@/components/account/bits";
import { FixCard } from "@/components/fix-card";
import { CaptionPanel } from "@/components/review/caption-panel";
import { ReviewBadge } from "@/components/review/review-panel";
import { RuleCheckRow } from "@/components/rule-check-row";
import { StatusBadge } from "@/components/status-badge";
import { TimecodeChip } from "@/components/timecode-chip";
import { Timeline, type TimelineLane } from "@/components/timeline";
import { formatHold, requiredHold } from "@/lib/asci";
import { contrast } from "@/lib/daypart";
import { boxAt, extent, inSpan, type Box, type Moment, type MomentKind, type Source } from "@/lib/details";
import { formatSeconds, formatTimecode } from "@/lib/format";
import { bySeverity, verdictStatus, type Report } from "@/lib/report";
import type { ReelReview } from "@/lib/review";
import { spokenMarkers, timelineSummary, verdictHeadline } from "@/lib/summary";
import { cn } from "@/lib/utils";

export interface SharedDetails {
  finding: string;
  moments: Moment[];
  poster: string;
  /** The brand's accent and darkest colours: the fixes are drawn in these two. */
  accent: string;
  ink: string;
}

interface ShareViewProps {
  reelId: string;
  report: Report;
  details: SharedDetails | null;
  brand: { name: string | null; logo: string };
  brandFont: string;
  review: Pick<ReelReview, "status" | "note" | "at"> | null;
  notes: { id: string; t: number; text: string }[];
  done: string[];
  caption: { caption: string; usesPlatformTag: boolean } | null;
}

const KIND_STYLE: Record<MomentKind, string> = {
  ASCI: "bg-fail-surface text-fail-text",
  Trust: "bg-review-surface text-review-text",
  Showcase: "bg-muted text-muted-foreground",
};

const HEADLINE = { approved: "Approved", changes: "Changes requested" };

export function ShareView({ reelId, report, details, brand, brandFont, review, notes, done, caption }: ShareViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [failed, setFailed] = useState(false);
  const moments = details?.moments ?? [];
  const [selected, setSelected] = useState(moments[0]?.id ?? "");
  const [withFixes, setWithFixes] = useState(false);
  const { duration_s: duration, width, height, filename } = report.video;

  // Coarse time is enough for the list; the overlay follows every frame itself.
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
        // Not seekable until its metadata loads; the list still moves.
      }
      const rect = video.getBoundingClientRect();
      if (rect.bottom < 64 || rect.top > window.innerHeight - 64) {
        video.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    },
    [duration],
  );

  const label = report.tracks.find((track) => track.kind === "disclosure_label");
  const needed = requiredHold(duration);
  const heldFrom = label?.first_seen_s ?? 0;
  const lanes: TimelineLane[] = [
    { id: "label", name: "Label", description: label?.label ?? "Disclosure label", segments: label?.spans ?? [] },
    {
      id: "needed",
      name: "Needed",
      description: `The hold ASCI needs, ${formatHold(needed.seconds)} (${needed.clause.code})`,
      segments: [{ t_start: heldFrom, t_end: Math.min(duration, heldFrom + needed.seconds) }],
    },
  ];
  if (moments.length) {
    lanes.push({
      id: "fixes",
      name: "Fixes",
      description: "A change to make",
      segments: moments.flatMap((moment) => moment.spans.map(({ t_start, t_end }) => ({ t_start, t_end }))),
    });
  }
  const noteMarkers = notes.map((note) => ({ t: note.t, text: note.text }));
  const spoken = spokenMarkers(report);
  const { headline } = verdictHeadline(report);
  const checks = bySeverity(report.checks);
  const hasFixes = moments.some((moment) => moment.fix);
  const openCount = moments.filter((moment) => !done.includes(moment.id)).length;

  return (
    <main id="main" className="mx-auto max-w-[1180px] px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <section aria-label="Where this Reel stands" className="grid gap-4 border-b border-border pb-6 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-end min-[900px]:gap-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            {brand.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- a small data: URL saved with the kit
              <img src={brand.logo} alt="" width={32} height={32} className="size-8 shrink-0 rounded-[6px] bg-muted object-contain" />
            ) : null}
            <p className="min-w-0 truncate text-sm font-semibold text-muted-foreground">{brand.name ? `From ${brand.name}` : "A Reel checked with Three Seconds"}</p>
          </div>
          <h1 className="mt-3 text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-[44px]">
            {review ? HEADLINE[review.status] : brand.name ? "Waiting for the brand" : headline}
          </h1>
          {review?.note ? <p className="mt-3 max-w-[64ch] text-[17px] leading-snug text-pretty whitespace-pre-line">{review.note}</p> : null}
          {review ? <p className="mt-2 text-[13px] text-muted-foreground">{when(review.at)}</p> : null}
        </div>
        <dl className="grid min-w-0 gap-2 text-sm min-[900px]:justify-items-end min-[900px]:text-right">
          <div className="flex flex-wrap items-center gap-2 min-[900px]:justify-end">
            <dt className="sr-only">Brand&rsquo;s answer</dt>
            <dd>
              <ReviewBadge status={review?.status} />
            </dd>
            <dt className="sr-only">On-screen check</dt>
            <dd>
              <StatusBadge status={verdictStatus(report.verdict)} />
            </dd>
          </div>
          <dt className="sr-only">Reel</dt>
          <dd className="font-mono text-[13px] break-all text-muted-foreground">
            {filename} · {formatTimecode(duration)}
          </dd>
        </dl>
      </section>

      <div className="mt-6 grid gap-8 min-[900px]:mt-8 min-[900px]:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] min-[900px]:gap-10">
        <section aria-label="The Reel" className="@container grid min-w-0 content-start gap-3 min-[900px]:sticky min-[900px]:top-4 min-[900px]:self-start">
          {hasFixes ? (
            <div role="group" aria-label="What the Reel shows" className="grid grid-cols-2 rounded-[8px] bg-muted p-1">
              {[
                [false, "As posted"],
                [true, "With fixes"],
              ].map(([value, word]) => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={withFixes === value}
                  onClick={() => setWithFixes(value as boolean)}
                  className={cn(
                    "h-8 rounded-[6px] text-[13px] font-semibold text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                    withFixes === value && "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
                  )}
                >
                  {word}
                </button>
              ))}
            </div>
          ) : null}

          <div
            className="@container relative mx-auto overflow-hidden rounded-[10px] bg-viewer-plate"
            style={{ aspectRatio: `${width} / ${height}`, height: `min(560px, calc(100dvh - 340px), calc(100cqw * ${height} / ${width}))`, minHeight: 320 }}
          >
            {failed ? (
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-viewer-plate-foreground">This video can&rsquo;t be played here.</p>
            ) : (
              <video
                ref={videoRef}
                // With no poster, a phone paints nothing until play unless it's told where to start.
                src={details?.poster ? report.video.blob_url : `${report.video.blob_url}#t=0.1`}
                poster={details?.poster}
                controls
                playsInline
                preload="metadata"
                onError={() => setFailed(true)}
                aria-label={`Video: ${filename}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {details ? <Overlay videoRef={videoRef} details={details} selected={selected} done={done} withFixes={withFixes} brandFont={brandFont} /> : null}
          </div>

          <Timeline
            duration={duration}
            lanes={lanes}
            markers={noteMarkers.length ? { name: "Notes", description: "A note", items: noteMarkers } : spoken.length ? { name: "Spoken", description: "Spoken disclosure", items: spoken } : undefined}
            playhead={time}
            videoRef={videoRef}
            onSeek={seek}
            summary={timelineSummary(report)}
          />
          <p className="text-[13px] text-muted-foreground">
            Measured from the file: {label?.spans.length ? `the label holds ${formatSeconds(label.longest_continuous_s)} at its longest` : "no label found"}. ASCI needs {formatHold(needed.seconds)} for a Reel this long.
          </p>
        </section>

        <div className="grid min-w-0 content-start gap-10">
          {moments.length ? (
            <section aria-labelledby="fixes-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="fixes-heading" className="text-[22px] font-bold tracking-[-0.02em]">
                  {openCount === 0 ? "All changes done" : `${openCount} ${openCount === 1 ? "change" : "changes"} ${review?.status === "approved" ? "suggested" : "to make"}`}
                </h2>
                {done.length ? <p className="text-[13px] text-muted-foreground">{moments.length - openCount} done</p> : null}
              </div>
              {details?.finding ? <p className="mt-1 max-w-[68ch] text-[15px] text-pretty text-muted-foreground">{details.finding}</p> : null}
              <ol className="mt-4 grid gap-2">
                {moments.map((moment, i) => (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    n={i + 1}
                    brand={brand.name ?? "the brand"}
                    selected={moment.id === selected}
                    playing={moment.spans.some((span) => inSpan(span, time))}
                    done={done.includes(moment.id)}
                    onChoose={() => {
                      setSelected(moment.id);
                      seek(extent(moment).t_start);
                    }}
                    onSeek={seek}
                  />
                ))}
              </ol>
            </section>
          ) : (
            <FixCard checks={report.checks} onSeek={seek} />
          )}

          {notes.length ? (
            <section aria-labelledby="notes-heading">
              <h2 id="notes-heading" className="text-[22px] font-bold tracking-[-0.02em]">
                Notes on the Reel
              </h2>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {notes.map((note) => (
                  <li key={note.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-3">
                    <TimecodeChip t={note.t} label={note.text} onSeek={seek} active={Math.abs(time - note.t) < 0.5} />
                    <p className="text-[15px] text-pretty whitespace-pre-line">{note.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {caption ? <CaptionPanel reelId={reelId} caption={caption} measured={report.verdict} view /> : null}

          <section aria-labelledby="checks-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
              <h2 id="checks-heading" className="text-[22px] font-bold tracking-[-0.02em]">
                The ASCI check
              </h2>
              <p className="text-[13px] text-muted-foreground">{checks.length} rules, worst first</p>
            </div>
            <ol className="divide-y divide-border">
              {checks.map((check) => (
                <RuleCheckRow key={check.id} check={check} time={time} onSeek={seek} />
              ))}
            </ol>
          </section>

          <p className="border-t border-border pt-4 text-[13px] text-muted-foreground">Checked against the ASCI influencer guidelines. This is not legal advice.</p>
        </div>
      </div>
    </main>
  );
}

function MomentCard({
  moment,
  n,
  brand,
  selected,
  playing,
  done,
  onChoose,
  onSeek,
}: {
  moment: Moment;
  n: number;
  brand: string;
  selected: boolean;
  playing: boolean;
  done: boolean;
  onChoose: () => void;
  onSeek: (t: number) => void;
}) {
  const { t_start, t_end } = extent(moment);
  return (
    <li
      aria-current={selected ? "true" : undefined}
      className={cn("grid grid-cols-[56px_minmax(0,1fr)] gap-3.5 rounded-[10px] border bg-card p-3 transition-colors duration-150 ease-out", selected ? "border-foreground" : "border-border")}
    >
      <button
        type="button"
        onClick={onChoose}
        aria-label={`Show change ${n} on the Reel: ${moment.title}`}
        className="relative h-[100px] w-14 overflow-hidden rounded-[6px] bg-muted transition-transform duration-150 ease-out active:scale-[0.97]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a 56px still from the Reel */}
        <img src={moment.thumb} alt="" className="size-full object-cover" loading="lazy" />
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex h-6 flex-none items-center rounded-sm px-2 text-xs font-bold", KIND_STYLE[moment.kind])}>{moment.kind}</span>
          <TimecodeChip t={t_start} end={t_end} label={moment.title} onSeek={onSeek} active={playing} />
          {done ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-pass-surface px-2 text-xs font-bold text-pass-text">
              <Check size={13} aria-hidden="true" />
              Done
            </span>
          ) : null}
        </div>
        <h3 className="mt-2">
          <button type="button" onClick={onChoose} className="rounded-sm text-left text-[17px] leading-snug font-bold tracking-[-0.01em] hover:underline">
            {n}. {moment.title}
          </button>
        </h3>
        {selected ? <Field label="What it does now">{moment.happened}</Field> : null}
        <Field label="What it should be">{moment.shouldBe}</Field>
        {selected ? (
          <Field label={`Why it matters for ${brand}`}>
            {moment.why}
            {moment.sources.length ? (
              <>
                {" "}
                <Sources sources={moment.sources} />
              </>
            ) : null}
          </Field>
        ) : null}
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[15px] leading-[1.45] text-pretty">{children}</p>
    </div>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <span className="text-[12px] text-muted-foreground">
      {sources.map((source, i) => (
        <span key={source.url + i}>
          {i > 0 ? ", " : null}
          <a href={source.url} target="_blank" rel="noreferrer" className="rounded-sm underline underline-offset-2 hover:text-foreground">
            {source.name}
            {source.date ? `, ${source.date}` : ""}
          </a>
        </span>
      ))}
    </span>
  );
}

const place = ([x, y, w, h]: Box) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

function useFrameTime(videoRef: RefObject<HTMLVideoElement | null>) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const read = () => setTime(video.currentTime);
    const loop = () => {
      read();
      frame = requestAnimationFrame(loop);
    };
    const play = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      read();
    };
    const events: [string, () => void][] = [
      ["playing", play],
      ["pause", stop],
      ["ended", stop],
      ["seeked", read],
      ["loadedmetadata", read],
    ];
    events.forEach(([name, fn]) => video.addEventListener(name, fn));
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(([name, fn]) => video.removeEventListener(name, fn));
    };
  }, [videoRef]);
  return time;
}

/** Decorative: the list beside the player carries everything these marks say. */
function Overlay({ videoRef, details, selected, done, withFixes, brandFont }: { videoRef: RefObject<HTMLVideoElement | null>; details: SharedDetails; selected: string; done: string[]; withFixes: boolean; brandFont: string }) {
  const time = useFrameTime(videoRef);
  const { moments, accent, ink } = details;
  const noteColour = contrast(accent, ink) >= 4.5 ? accent : "#ffffff";
  const outlined = moments.flatMap((moment, i) => {
    const span = moment.id === selected || !done.includes(moment.id) ? moment.spans.find((s) => inSpan(s, time)) : undefined;
    return span ? [{ moment, n: i + 1, span }] : [];
  });
  const fixes = moments.flatMap((moment) => (moment.fix && moment.fix.spans.some((s) => inSpan(s, time)) ? [{ id: moment.id, fix: moment.fix }] : []));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {withFixes
        ? fixes.map(({ id, fix }) => (
            <div key={id} className="absolute flex items-center justify-center transition-opacity duration-200 ease-out starting:opacity-0" style={place(fix.box)}>
              <span
                className={cn("inline-flex h-full max-w-full items-center truncate px-[0.9em] font-semibold whitespace-nowrap", fix.style === "label" ? "justify-start rounded-[0.5em]" : "rounded-full")}
                style={{
                  fontFamily: brandFont,
                  fontSize: "clamp(9px, 3.1cqw, 15px)",
                  background: fix.style === "pill" ? accent : ink,
                  color: fix.style === "pill" ? textColourOn(accent, [ink]) : fix.style === "label" ? "#ffffff" : noteColour,
                }}
              >
                {fix.text}
              </span>
            </div>
          ))
        : outlined.map(({ moment, n, span }) => {
            const active = moment.id === selected;
            const box = boxAt(span, time);
            return (
              <div
                key={`${moment.id}-${span.t_start}`}
                className={cn("absolute rounded-[6px] border-brand transition-opacity duration-150 ease-out starting:opacity-0", active ? "border-[2.5px]" : "border-[1.5px] border-dashed opacity-80")}
                style={place(box)}
              >
                <span
                  className={cn(
                    "absolute left-1/2 max-w-[calc(100%+40px)] -translate-x-1/2 truncate px-1.5 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap",
                    box[1] < 0.06 ? "top-full rounded-b-[5px]" : "-top-px -translate-y-full rounded-t-[5px]",
                    active ? "bg-brand text-brand-foreground" : "bg-black/70 text-white",
                  )}
                >
                  {active ? `${n}. ${moment.title}` : n}
                </span>
              </div>
            );
          })}
    </div>
  );
}

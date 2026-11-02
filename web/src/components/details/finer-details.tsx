"use client";

import { ArrowLeft, ArrowUpRight, Check, Copy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, Panel } from "@/components/account/bits";
import { AnnotatedPlayer, type PlayerMode } from "@/components/details/annotated-player";
import { TimecodeChip } from "@/components/timecode-chip";
import { Timeline, type TimelineLane } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { extent, type FinerDetails, fixList, inSpan, type Moment, type MomentKind, type Source } from "@/lib/details";
import { formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS: MomentKind[] = ["ASCI", "Trust", "Showcase"];
const KIND_STYLE: Record<MomentKind, string> = {
  ASCI: "bg-fail-surface text-fail-text",
  Trust: "bg-review-surface text-review-text",
  Showcase: "bg-muted text-muted-foreground",
};

export function FinerDetailsScreen({ details, brandFont, preview }: { details: FinerDetails; brandFont: string; preview?: boolean }) {
  const { reel, moments, brand } = details;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState(moments[0]?.id ?? "");
  const [mode, setMode] = useState<PlayerMode>("posted");

  // Coarse time (about 4 a second) is enough for the list; the player follows every frame itself.
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
      const next = Math.min(Math.max(t, 0), reel.duration_s);
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
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        video.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }
    },
    [reel.duration_s],
  );

  const choose = (moment: Moment) => {
    setSelected(moment.id);
    seek(extent(moment).t_start);
  };

  const lanes: TimelineLane[] = KINDS.map((kind) => ({
    id: kind,
    name: kind,
    description: `${kind} change`,
    segments: moments.filter((m) => m.kind === kind).flatMap((m) => m.spans.map(({ t_start, t_end }) => ({ t_start, t_end }))),
  })).filter((lane) => lane.segments.length > 0);
  const counts = KINDS.map((kind) => `${moments.filter((m) => m.kind === kind).length} ${kind}`).join(", ");

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href="/dashboard/reels"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Reels
        </Link>
        <PageHeader title="Finer details" description={details.finding} action={<CopyFixes text={fixList(details, formatTimecode)} />} />
      </div>

      {preview ? (
        <p className="rounded-[6px] bg-review-surface px-3 py-2 text-[12px] text-review-text">
          Preview on {reel.filename}: these changes, outlines and fixes were placed by hand to agree the design. The pipeline that finds them
          comes next.
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <section aria-label="The Reel" className="min-w-0 md:sticky md:top-6 md:self-start">
          <AnnotatedPlayer details={details} videoRef={videoRef} mode={mode} onMode={setMode} selected={selected} brandFont={brandFont} />
          <Timeline
            className="mt-4"
            duration={reel.duration_s}
            lanes={lanes}
            playhead={time}
            videoRef={videoRef}
            onSeek={seek}
            summary={`${moments.length} changes across ${reel.duration_s} seconds: ${counts}.`}
          />
        </section>

        <section aria-labelledby="changes-heading" className="min-w-0">
          <div className="flex items-baseline justify-between gap-4 pb-3">
            <h2 id="changes-heading" className="text-[18px] font-bold tracking-[-0.01em]">
              {moments.length} changes
            </h2>
            <p className="text-[13px] text-muted-foreground">Most important first</p>
          </div>
          <ol className="grid gap-1.5">
            {moments.map((moment, i) => (
              <MomentRow
                key={moment.id}
                moment={moment}
                n={i + 1}
                brand={brand.name}
                selected={moment.id === selected}
                playing={moment.spans.some((s) => inSpan(s, time))}
                onChoose={() => choose(moment)}
                onSeek={seek}
              />
            ))}
          </ol>
        </section>

        <aside className="grid min-w-0 content-start gap-4 md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
          <Panel title="Brand kit" action={<SiteLink site={brand.site} />}>
            <div className="flex items-center gap-3 px-5 pt-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- a small local asset; next/image adds nothing here */}
              <img src={brand.logo} alt="" width={44} height={44} className="size-11 rounded-[8px] bg-muted [image-rendering:pixelated]" />
              <div className="min-w-0">
                <p className="text-[15px] font-bold">{brand.name}</p>
                <p className="text-sm text-muted-foreground">{brand.tagline}</p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
              <dt className="pt-0.5 text-[12px] text-muted-foreground">Colours</dt>
              <dd className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {brand.colors.map((c) => (
                  <span key={c.hex} className="flex items-center gap-2">
                    <span className="size-4 shrink-0 rounded-[4px] border border-border" style={{ background: c.hex }} />
                    <span className="font-mono text-[12px]">{c.hex}</span>
                  </span>
                ))}
              </dd>
              <dt className="text-[12px] text-muted-foreground">Type</dt>
              <dd>{brand.fonts.join(" · ")}</dd>
            </dl>
            <p className="border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
              Read from {brand.site} on {readDate(brand.read_at)}. The fixes on the Reel use these colours.
            </p>
          </Panel>

          <Panel
            title="What people say"
            className="md:row-span-2 xl:row-span-1"
            action={<span className="text-[12px] text-muted-foreground">{new Set(details.mentions.map((m) => m.source.url)).size} sources</span>}
          >
            {(["good", "watch"] as const).map((tone) => (
              <div key={tone} className="px-5 py-3 not-last:border-b not-last:border-border">
                <h3 className="text-[12px] text-muted-foreground">{tone === "good" ? "In its favour" : "Watch out for"}</h3>
                <ul className="mt-1.5 grid gap-2.5">
                  {details.mentions
                    .filter((m) => m.tone === tone)
                    .map((m) => (
                      <li key={m.text} className="grid grid-cols-[6px_minmax(0,1fr)] gap-2.5 text-sm">
                        <span aria-hidden="true" className={cn("mt-[7px] size-1.5 rounded-full", tone === "good" ? "bg-pass" : "bg-review")} />
                        <div>
                          <p>{m.text}</p>
                          <Sources sources={[m.source]} className="mt-0.5 block" />
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </Panel>

          <Panel title="Who it&rsquo;s for">
            <dl className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <dt className="text-[12px] text-muted-foreground">{brand.name}&rsquo;s market</dt>
                <dd className="mt-0.5">{details.audience.market}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-muted-foreground">This Reel&rsquo;s viewer</dt>
                <dd className="mt-0.5">{details.audience.viewer}</dd>
              </div>
            </dl>
            <p className="border-t border-border px-5 py-3 text-[12px] text-muted-foreground">
              An estimate from public sources, not audience data: <Sources sources={details.audience.sources} />.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function MomentRow({
  moment,
  n,
  brand,
  selected,
  playing,
  onChoose,
  onSeek,
}: {
  moment: Moment;
  n: number;
  brand: string;
  selected: boolean;
  playing: boolean;
  onChoose: () => void;
  onSeek: (t: number) => void;
}) {
  const { t_start, t_end } = extent(moment);
  return (
    <li
      aria-current={selected ? "true" : undefined}
      className={cn(
        "grid grid-cols-[56px_minmax(0,1fr)] gap-3.5 rounded-[10px] border p-3 transition-colors duration-150 ease-out",
        selected ? "border-border bg-card" : "border-transparent hover:bg-card/60",
      )}
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
          <span className={cn("inline-flex h-6 flex-none items-center rounded-[4px] px-2 text-[12px] font-semibold", KIND_STYLE[moment.kind])}>
            {moment.kind}
          </span>
          <TimecodeChip t={t_start} end={t_end} label={moment.title} onSeek={onSeek} active={playing} />
        </div>
        <h3 className="mt-2">
          <button type="button" onClick={onChoose} className="rounded-sm text-left text-[16px] leading-snug font-bold tracking-[-0.01em] hover:underline">
            {n}. {moment.title}
          </button>
        </h3>
        {selected ? <Field label="What happened">{moment.happened}</Field> : null}
        <Field label="Should be">{moment.shouldBe}</Field>
        {selected ? (
          <Field label={`Why it matters for ${brand}`}>
            {moment.why}
            {moment.sources.length ? (
              <>
                {" "}
                <Sources sources={moment.sources} className="text-muted-foreground" />
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
      <p className="mt-0.5 text-sm leading-[1.5] text-pretty">{children}</p>
    </div>
  );
}

function Sources({ sources, className }: { sources: Source[]; className?: string }) {
  return (
    <span className={cn("text-[12px]", className)}>
      {sources.map((s, i) => (
        <span key={s.url + i}>
          {i > 0 ? ", " : null}
          <a href={s.url} target="_blank" rel="noreferrer" className="rounded-sm underline underline-offset-2 hover:text-foreground">
            {s.name}, {s.date}
          </a>
        </span>
      ))}
    </span>
  );
}

function SiteLink({ site }: { site: string }) {
  return (
    <a
      href={`https://${site}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-sm text-[13px] font-semibold text-muted-foreground hover:text-foreground"
    >
      {site}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

function readDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

/** Copies the fix list. On plain-http dev links the Clipboard API is missing, so it falls back to a hidden textarea. */
function CopyFixes({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      if (!window.isSecureContext || !navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
  }

  return (
    <Button size="compact" onClick={copy}>
      {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy fixes for the creator"}</span>
    </Button>
  );
}

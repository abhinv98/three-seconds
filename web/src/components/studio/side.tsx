"use client";

import { ArrowUpRight, Check, Copy, Download, Eye, Trash2 } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { finerDetailsAction } from "@/app/dashboard/actions";
import { deleteNoteAction, saveCaptionAction } from "@/app/dashboard/review-actions";
import { Notice } from "@/components/account/bits";
import { KitSummary } from "@/components/details/kit-summary";
import { StatusBadge } from "@/components/status-badge";
import { TimecodeChip } from "@/components/timecode-chip";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { checkCaption } from "@/lib/caption";
import { collidesWithUi, extent, type FinerDetails, inSpan, type Moment, type MomentKind, type Source } from "@/lib/details";
import { formatRange, formatTimecode } from "@/lib/format";
import { bySeverity, type Report, verdictStatus } from "@/lib/report";
import type { ReelCaption, ReelNote } from "@/lib/review";
import type { SceneData } from "@/lib/scene";
import { cn } from "@/lib/utils";
import { type Clock, elapsedText, useElapsed, useTimeStep } from "./clock";
import { type BrandMention, clamp } from "./geometry";

export const READ_ONLY_HINT = "This is the public sample, so it's read-only.";

/** A disabled control can't hold a tooltip itself, so a read-only one sits in a span that can. */
export function Gated({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="st-gated">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent data-theme="dark" side="top" sideOffset={6}>
        {READ_ONLY_HINT}
      </TooltipContent>
    </Tooltip>
  );
}

export async function copyText(text: string) {
  try {
    if (!window.isSecureContext || !navigator.clipboard) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
  } catch {
    // Plain-http dev links have no Clipboard API.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

const KIND_STYLE: Record<MomentKind, string> = {
  ASCI: "bg-fail-surface text-fail-text",
  Trust: "bg-review-surface text-review-text",
  Showcase: "bg-muted text-muted-foreground",
};

function Sources({ sources }: { sources: Source[] }) {
  return (
    <span className="st-sources">
      {sources.map((s, i) => (
        <span key={s.url + i}>
          {i > 0 ? ", " : null}
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.name}
            {s.date ? `, ${s.date}` : ""}
          </a>
        </span>
      ))}
    </span>
  );
}

const STEPS = [
  "A frame a second goes to the model, with the ASCI report, the transcript and the brand kit.",
  "It lists what to change before the Reel goes live, and where each change shows.",
  "SAM 3.1 follows each of those on screen, frame by frame, so the outlines move with them.",
];

function ReadingState({ since }: { since: string }) {
  const seconds = useElapsed(since);
  return (
    <section className="st-state" aria-live="polite">
      <p className="st-state-title">
        <span className="st-pulse" aria-hidden="true" />
        Reading the Reel
        <span className="st-state-time">{elapsedText(seconds)}</span>
      </p>
      <p className="st-muted">About two minutes in all. The monitor and timeline work now, and the changes appear here when the read finishes.</p>
      <ol className="st-steps">
        {STEPS.map((step, i) => (
          <li key={step}>
            <span>{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}

function RetryForm({ reelId, readOnly, label }: { reelId: string; readOnly: boolean; label: string }) {
  return (
    <form action={finerDetailsAction}>
      <input type="hidden" name="reelId" value={reelId} />
      <Gated readOnly={readOnly}>
        <Button type="submit" size="compact-sm" variant="secondary" disabled={readOnly}>
          {label}
        </Button>
      </Gated>
    </form>
  );
}

interface CardProps {
  moment: Moment;
  n: number;
  brand: string;
  selected: boolean;
  hot: boolean;
  active: boolean;
  done: boolean;
  readOnly: boolean;
  onChoose: (moment: Moment) => void;
  onHot: (id: string | null) => void;
  onSeek: (t: number) => void;
  onShowFix: (moment: Moment) => void;
  onDone: (id: string, done: boolean) => void;
}

const MomentCard = memo(function MomentCard({ moment, n, brand, selected, hot, active, done, readOnly, onChoose, onHot, onSeek, onShowFix, onDone }: CardProps) {
  const ref = useRef<HTMLLIElement>(null);
  const { t_start, t_end } = extent(moment);
  useEffect(() => {
    if (selected && window.matchMedia("(min-width: 1100px)").matches) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const forCreator = `${n}. ${moment.title} (${formatRange(t_start, t_end)})\n${moment.shouldBe}`;
  return (
    <li ref={ref} className="st-card" data-selected={selected || undefined} data-hot={hot || undefined} data-done={done || undefined} onPointerEnter={() => onHot(moment.id)} onPointerLeave={() => onHot(null)}>
      <button type="button" className="st-still" onClick={() => onChoose(moment)} aria-label={`Show change ${n} on the Reel: ${moment.title}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small still saved with the read */}
        <img src={moment.thumb} alt="" loading="lazy" />
        {done ? (
          <span className="st-still-done">
            <Check size={16} aria-hidden="true" />
          </span>
        ) : null}
      </button>
      <div className="st-card-body">
        <div className="st-card-meta">
          <span className={cn("st-kind", KIND_STYLE[moment.kind])}>{moment.kind}</span>
          <TimecodeChip t={t_start} end={t_end} label={moment.title} onSeek={onSeek} active={active} className="st-chip" />
        </div>
        <h3 className="st-card-title">
          <button type="button" onClick={() => onChoose(moment)}>
            {n}. {moment.title}
          </button>
        </h3>
        {selected ? (
          <div className="st-card-more">
            <Field label="What it does now">{moment.happened}</Field>
            <Field label="What it should be">{moment.shouldBe}</Field>
            <Field label={`Why it matters for ${brand}`}>
              {moment.why}
              {moment.sources.length ? (
                <>
                  {" "}
                  <Sources sources={moment.sources} />
                </>
              ) : null}
            </Field>
            <div className="st-card-actions">
              {moment.fix ? (
                <Button size="compact-sm" onClick={() => onShowFix(moment)}>
                  <Eye size={14} aria-hidden="true" />
                  Show fix
                </Button>
              ) : null}
              <Button
                size="compact-sm"
                variant="secondary"
                onClick={async () => {
                  await copyText(forCreator);
                  toast("Copied for the creator", { tone: "ok" });
                }}
              >
                <Copy size={14} aria-hidden="true" />
                Copy for the creator
              </Button>
              <Gated readOnly={readOnly}>
                <Button size="compact-sm" variant="secondary" disabled={readOnly} aria-pressed={done} onClick={() => onDone(moment.id, !done)}>
                  <Check size={14} aria-hidden="true" />
                  {done ? "Done" : "Mark done"}
                </Button>
              </Gated>
            </div>
          </div>
        ) : (
          <p className="st-card-should">{moment.shouldBe}</p>
        )}
      </div>
    </li>
  );
});

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="st-field">
      <p className="st-field-name">{label}</p>
      <p>{children}</p>
    </div>
  );
}

function SpriteTile({ sprite, t }: { sprite: SceneData["sprite"]; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const tile = clamp(Math.floor(t / sprite.every_s), 0, sprite.cols * sprite.rows - 1);
      ctx.drawImage(image, (tile % sprite.cols) * sprite.tile_w, Math.floor(tile / sprite.cols) * sprite.tile_h, sprite.tile_w, sprite.tile_h, 0, 0, canvas.width, canvas.height);
    };
    image.src = sprite.src;
  }, [sprite, t]);
  return <canvas ref={ref} width={sprite.tile_w} height={sprite.tile_h} aria-hidden="true" className="st-cover-tile" />;
}

function Covers({ scene, onSeek, onStill }: { scene: SceneData; onSeek: (t: number) => void; onStill: (t: number) => void }) {
  if (!scene.covers.length) {
    return <p className="st-muted">No frame has the creator&rsquo;s face and the product together, so there&rsquo;s no cover to suggest.</p>;
  }
  return (
    <>
      <ul className="st-covers">
        {scene.covers.map((cover) => (
          <li key={cover.t}>
            <button type="button" className="st-cover" onClick={() => onSeek(cover.t)} aria-label={`Go to the cover frame at ${formatTimecode(cover.t)}`}>
              <SpriteTile sprite={scene.sprite} t={cover.t} />
              <span className="st-cover-time">{formatTimecode(cover.t)}</span>
            </button>
            <button type="button" className="st-tool st-cover-save" onClick={() => onStill(cover.t)} aria-label={`Download the still at ${formatTimecode(cover.t)}`} title="Download the still">
              <Download size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className="st-muted">{scene.covers[0].why}</p>
    </>
  );
}

export interface SideProps {
  reelId: string;
  details: FinerDetails | null;
  job: { status: "reading" | "done" | "error"; error?: string | null; started_at: string };
  report: Report;
  scene: SceneData | null;
  sceneStatus: string;
  sceneError: string | null;
  sceneSince: string | null;
  mentions: BrandMention[];
  notes: ReelNote[];
  done: Set<string>;
  readOnly: boolean;
  caption: ReelCaption | null;
  clock: Clock;
  selected: string | null;
  hot: string | null;
  onHot: (id: string | null) => void;
  onChoose: (moment: Moment) => void;
  onSeek: (t: number) => void;
  onShowFix: (moment: Moment) => void;
  onDone: (id: string, done: boolean) => void;
  onStill: (t: number) => void;
  onNoteGone: (id: string) => void;
}

export function SidePanel(props: SideProps) {
  const [tab, setTab] = useState<"improve" | "brand">("improve");
  const tabs = [
    { id: "improve" as const, name: "Improve perception" },
    { id: "brand" as const, name: "Brand check" },
  ];
  return (
    <aside className="st-side">
      <div role="tablist" aria-label="Finer details" className="st-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`st-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`st-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className="st-tab"
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = tab === "improve" ? "brand" : "improve";
              setTab(next);
              document.getElementById(`st-tab-${next}`)?.focus();
            }}
          >
            {t.name}
          </button>
        ))}
        <span className="st-tab-ink" aria-hidden="true" style={{ transform: tab === "improve" ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)" }} />
      </div>
      <div role="tabpanel" id="st-panel-improve" aria-labelledby="st-tab-improve" className="st-panel" hidden={tab !== "improve"}>
        <ImproveTab {...props} />
      </div>
      <div role="tabpanel" id="st-panel-brand" aria-labelledby="st-tab-brand" className="st-panel" hidden={tab !== "brand"}>
        <BrandTab {...props} />
      </div>
    </aside>
  );
}

function ImproveTab({ reelId, details, job, scene, sceneStatus, notes, done, readOnly, clock, selected, hot, onHot, onChoose, onSeek, onShowFix, onDone, onStill, onNoteGone }: SideProps) {
  const moments = useMemo(() => details?.moments ?? [], [details]);
  const t = useTimeStep(clock, 0.25);
  const activeKey = moments
    .filter((m) => m.spans.some((s) => inSpan(s, t)))
    .map((m) => m.id)
    .join(" ");
  const active = useMemo(() => new Set(activeKey.split(" ")), [activeKey]);
  const counts = (["ASCI", "Trust", "Showcase"] as const).map((kind) => [kind, moments.filter((m) => m.kind === kind).length] as const).filter(([, n]) => n);
  const brand = details?.brand.name ?? "the brand";
  return (
    <div className="st-panel-scroll">
      {job.status === "reading" && !details ? <ReadingState since={job.started_at} /> : null}
      {job.status === "error" ? (
        <section className="st-state">
          <Notice tone="fail">The read didn&rsquo;t finish: {job.error ?? "no reason given."}</Notice>
          <RetryForm reelId={reelId} readOnly={readOnly} label="Try again" />
        </section>
      ) : null}
      {details ? (
        <>
          <section className="st-finding">
            <p>{details.finding}</p>
          </section>
          {moments.length ? (
            <section aria-label="Changes to make">
              <header className="st-section-head">
                <h2>
                  {moments.length} {moments.length === 1 ? "change" : "changes"}
                </h2>
                <span>
                  {counts.map(([kind, n]) => `${n} ${kind}`).join(", ")}
                  {done.size ? `. ${done.size} done` : ""}
                </span>
              </header>
              <ol className="st-cards">
                {moments.map((moment, i) => (
                  <MomentCard
                    key={moment.id}
                    moment={moment}
                    n={i + 1}
                    brand={brand}
                    selected={moment.id === selected}
                    hot={moment.id === hot}
                    active={active.has(moment.id)}
                    done={done.has(moment.id)}
                    readOnly={readOnly}
                    onChoose={onChoose}
                    onHot={onHot}
                    onSeek={onSeek}
                    onShowFix={onShowFix}
                    onDone={onDone}
                  />
                ))}
              </ol>
            </section>
          ) : (
            <section className="st-state">
              <p className="st-state-title">Nothing to change</p>
              <p className="st-muted">The read found no changes to suggest for this Reel. The measurements are under Brand check.</p>
            </section>
          )}
        </>
      ) : null}
      <section aria-label="Cover frame">
        <header className="st-section-head">
          <h2>Cover frame</h2>
        </header>
        {scene ? <Covers scene={scene} onSeek={onSeek} onStill={onStill} /> : <p className="st-muted">{sceneStatus === "reading" ? "The covers come from tracking, which is still running." : "Covers need tracking, and this Reel has none."}</p>}
      </section>
      <NotesList reelId={reelId} notes={notes} readOnly={readOnly} onSeek={onSeek} onGone={onNoteGone} />
    </div>
  );
}

function NotesList({ reelId, notes, readOnly, onSeek, onGone }: { reelId: string; notes: ReelNote[]; readOnly: boolean; onSeek: (t: number) => void; onGone: (id: string) => void }) {
  const [, start] = useTransition();
  return (
    <section aria-label="Notes">
      <header className="st-section-head">
        <h2>Notes</h2>
        <span>{notes.length || ""}</span>
      </header>
      {notes.length ? (
        <ul className="st-notes">
          {notes.map((note) => (
            <li key={note.id}>
              <TimecodeChip t={note.t} label={note.text} onSeek={onSeek} className="st-chip" />
              <p>
                {note.text}
                <span className="st-note-by">{note.by_name}</span>
              </p>
              {readOnly ? null : (
                <button
                  type="button"
                  className="st-tool"
                  aria-label={`Delete the note at ${formatTimecode(note.t)}`}
                  onClick={() =>
                    start(async () => {
                      onGone(note.id);
                      const result = await deleteNoteAction(reelId, note.id);
                      if ("error" in result) toast(result.error, { tone: "fail" });
                    })
                  }
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="st-muted">No notes yet. Add one at the playhead from the transport.</p>
      )}
    </section>
  );
}

const pct = (share: number) => {
  const percent = share * 100;
  return `${percent >= 10 || percent === 0 ? Math.round(percent) : percent.toFixed(1)}%`;
};

interface MeasuredLine {
  name: string;
  value: string;
  detail?: string;
  t?: number | null;
}

function measuredLines(scene: SceneData): MeasuredLine[] {
  const { stats, tracks, failed, phrases } = scene;
  const notRun = (id: string) => failed.includes(id);
  const firstHit = (frames: { t: number; box: [number, number, number, number] }[]) => frames.find((f) => collidesWithUi(f.box))?.t ?? null;
  const lines: MeasuredLine[] = [];
  lines.push(
    notRun("person") && notRun("face")
      ? { name: "Creator on camera", value: "Not measured" }
      : {
          name: "Creator on camera",
          value: `${pct(stats.creatorOnCameraShare)} of the Reel`,
          detail: stats.creatorFirstSeen === null ? "Never seen" : `First seen ${formatTimecode(stats.creatorFirstSeen)}`,
          t: stats.creatorFirstSeen,
        },
  );
  if (notRun("product")) {
    lines.push({ name: "Product on screen", value: "Not measured" });
  } else {
    lines.push({
      name: "Product on screen",
      value: `${pct(stats.productShare)} of the Reel`,
      detail: stats.productFirstSeen === null ? `"${phrases.product}" never seen` : `"${phrases.product}" first seen ${formatTimecode(stats.productFirstSeen)}`,
      t: stats.productFirstSeen,
    });
    if (stats.productLargest) lines.push({ name: "Product at its largest", value: `${pct(stats.productLargest.share)} of the frame`, detail: `At ${formatTimecode(stats.productLargest.t)}`, t: stats.productLargest.t });
  }
  lines.push(
    notRun("logo")
      ? { name: "Logo on screen", value: "Not measured" }
      : {
          name: "Logo on screen",
          value: `${pct(stats.logoShare)} of the Reel`,
          detail: stats.logoFirstSeen === null ? "Never seen" : `First seen ${formatTimecode(stats.logoFirstSeen)}`,
          t: stats.logoFirstSeen,
        },
  );
  lines.push({
    name: "In the hook, the first 3s",
    value: `Product ${stats.productInHook ? "yes" : "no"}. Logo ${stats.logoInHook ? "yes" : "no"}.`,
    t: 0,
  });
  lines.push({
    name: "Shots and pacing",
    value: `${stats.shotCount} ${stats.shotCount === 1 ? "shot" : "shots"}, ${stats.averageShotS.toFixed(1)}s on average`,
    detail: `First shot runs ${stats.firstShotS.toFixed(1)}s`,
    t: scene.shots[0] ?? null,
  });
  lines.push({
    name: "Under Instagram's UI",
    value: `Product ${pct(stats.safeZone.product)}. Face ${pct(stats.safeZone.face)}. Logo ${pct(stats.safeZone.logo)}.`,
    detail: "Share of the time each is on screen",
    t: firstHit(tracks.product) ?? firstHit(tracks.face) ?? firstHit(tracks.logo),
  });
  return lines;
}

function BrandTab({ reelId, details, report, scene, sceneStatus, sceneError, sceneSince, mentions, readOnly, caption, onSeek }: SideProps) {
  const seconds = useElapsed(sceneStatus === "reading" ? sceneSince : null);
  const lines = useMemo(() => (scene ? measuredLines(scene) : []), [scene]);
  const said = mentions;
  const brandName = details?.brand.name ?? report.tracks.find((track) => track.kind === "brand")?.label ?? "The brand";
  return (
    <div className="st-panel-scroll">
      <section aria-label="Measured in this Reel">
        <header className="st-section-head">
          <h2>Measured in this Reel</h2>
          {scene ? <span>SAM 3.1 at {scene.fps} fps</span> : null}
        </header>
        {scene ? (
          <ul className="st-measured">
            {lines.map((line) => (
              <li key={line.name}>
                <MeasuredRow line={line} onSeek={onSeek} />
              </li>
            ))}
          </ul>
        ) : sceneStatus === "reading" ? (
          <p className="st-state-title st-tracking">
            <span className="st-pulse" aria-hidden="true" />
            Tracking with SAM 3.1
            <span className="st-state-time">{elapsedText(seconds)}</span>
          </p>
        ) : (
          <p className="st-muted">{sceneStatus === "failed" ? `Tracking failed: ${sceneError ?? "no reason given."}` : sceneStatus === "loading" ? "Loading the tracking data." : "This Reel has no tracking. Reading it again adds it."}</p>
        )}
        <ul className="st-measured">
          <li>
            <div className="st-measured-row st-measured-said">
              <span className="st-measured-name">{brandName} said at</span>
              {report.audio_checked ? (
                said.length ? (
                  <span className="st-said">
                    {said.slice(0, 12).map((m) => (
                      <TimecodeChip key={`${m.t}-${m.word}`} t={m.t_start} label={`"${m.word}" said here`} onSeek={onSeek} inline />
                    ))}
                    {said.length > 12 ? <span className="st-muted">and {said.length - 12} more</span> : null}
                  </span>
                ) : (
                  <span className="st-measured-value">Not said in the transcript</span>
                )
              ) : (
                <span className="st-measured-value">The audio wasn&rsquo;t checked</span>
              )}
            </div>
          </li>
        </ul>
      </section>

      <section aria-label="ASCI checks">
        <header className="st-section-head">
          <h2>ASCI checks</h2>
          <StatusBadge status={verdictStatus(report.verdict)} />
        </header>
        <ul className="st-checks">
          {bySeverity(report.checks).map((check) => (
            <li key={check.id}>
              <div className="st-check-head">
                <StatusBadge status={verdictStatus(check.verdict)} />
                <h3>{check.title}</h3>
              </div>
              <p>{check.detail}</p>
              {check.evidence.length ? (
                <p className="st-check-times">
                  {check.evidence.slice(0, 6).map((e) => (
                    <TimecodeChip key={`${e.t_start}-${e.note}`} t={e.t_start} end={e.t_end} label={e.note} onSeek={onSeek} inline />
                  ))}
                </p>
              ) : null}
              {check.clause ? (
                <blockquote>
                  &ldquo;{check.clause.text}&rdquo;
                  <cite>
                    {check.clause.source_url ? (
                      <a href={check.clause.source_url} target="_blank" rel="noreferrer">
                        {check.clause.code}
                      </a>
                    ) : (
                      check.clause.code
                    )}
                  </cite>
                </blockquote>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <CaptionCheck reelId={reelId} saved={caption} readOnly={readOnly} />

      {details ? (
        <>
          <section aria-label="Brand kit">
            <header className="st-section-head">
              <h2>Brand kit</h2>
              <a className="st-site" href={`https://${details.brand.site}`} target="_blank" rel="noreferrer">
                {details.brand.site}
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            </header>
            <div className="st-kit">
              <KitSummary brand={details.brand} />
            </div>
          </section>

          <section aria-label="What people say">
            <header className="st-section-head">
              <h2>What people say</h2>
              <span>{new Set(details.mentions.map((m) => m.source.url)).size} sources</span>
            </header>
            {details.mentions.length ? (
              <ul className="st-mentions">
                {details.mentions.map((m) => (
                  <li key={m.text} data-tone={m.tone}>
                    <span className="st-mention-dot" aria-label={m.tone === "good" ? "In its favour" : "Watch out for"} />
                    <p>
                      {m.text} <Sources sources={[m.source]} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="st-muted">The research found nothing recent to quote.</p>
            )}
          </section>

          <section aria-label="Who it's for">
            <header className="st-section-head">
              <h2>Who it&rsquo;s for</h2>
            </header>
            <dl className="st-audience">
              <div>
                <dt>{details.brand.name}&rsquo;s market</dt>
                <dd>{details.audience.market}</dd>
              </div>
              <div>
                <dt>This Reel&rsquo;s viewer</dt>
                <dd>{details.audience.viewer}</dd>
              </div>
            </dl>
            <p className="st-muted">
              An estimate from public sources, not audience data: <Sources sources={details.audience.sources} />.
            </p>
          </section>
        </>
      ) : (
        <section>
          <p className="st-muted">The brand kit, what people say and who it&rsquo;s for appear when the read finishes.</p>
        </section>
      )}
    </div>
  );
}

function MeasuredRow({ line, onSeek }: { line: MeasuredLine; onSeek: (t: number) => void }) {
  const body = (
    <>
      <span className="st-measured-name">{line.name}</span>
      <span className="st-measured-value">{line.value}</span>
      {line.detail ? <span className="st-measured-detail">{line.detail}</span> : null}
    </>
  );
  if (line.t === null || line.t === undefined) return <div className="st-measured-row">{body}</div>;
  const t = line.t;
  return (
    <button type="button" className="st-measured-row st-measured-link" onClick={() => onSeek(t)} aria-label={`${line.name}: ${line.value}. Go to ${formatTimecode(t)}`}>
      {body}
      <span className="st-measured-go">{formatTimecode(t)}</span>
    </button>
  );
}

function CaptionCheck({ reelId, saved, readOnly }: { reelId: string; saved: ReelCaption | null; readOnly: boolean }) {
  const [text, setText] = useState(saved?.caption ?? "");
  const [tag, setTag] = useState(saved?.usesPlatformTag ?? false);
  const [pending, start] = useTransition();
  const result = useMemo(() => checkCaption(text, tag), [text, tag]);
  const save = useCallback(() => {
    start(async () => {
      const answer = await saveCaptionAction(reelId, text, tag);
      if ("error" in answer) toast(answer.error, { tone: "fail" });
      else toast("Caption saved", { tone: "ok" });
    });
  }, [reelId, text, tag]);
  return (
    <section aria-label="Caption and platform tag">
      <header className="st-section-head">
        <h2>Caption and platform tag</h2>
        <StatusBadge status={verdictStatus(result.verdict)} />
      </header>
      <textarea
        className="st-textarea"
        rows={3}
        value={text}
        readOnly={readOnly}
        placeholder="Paste the post's caption"
        aria-label="The post's caption"
        onChange={(e) => setText(e.target.value)}
      />
      <label className="st-check-line">
        <input type="checkbox" checked={tag} onChange={(e) => setTag(e.target.checked)} />
        Will post with Instagram&rsquo;s Paid partnership tag
      </label>
      <ul className="st-caption-lines">
        {result.lines.map((line) => (
          <li key={line.text} data-ok={line.ok || undefined}>
            {line.text}
          </li>
        ))}
      </ul>
      <p className="st-muted">Instagram adds its tag at posting, so it isn&rsquo;t in the file. A file with no burned-in label fails the on-screen check but can pass with the tag.</p>
      <Gated readOnly={readOnly}>
        <Button size="compact-sm" variant="secondary" disabled={readOnly || pending} onClick={save}>
          Save the caption
        </Button>
      </Gated>
    </section>
  );
}

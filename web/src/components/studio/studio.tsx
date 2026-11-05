"use client";

import { ArrowLeft, Check, ChevronDown, CircleHelp, FileDown, Keyboard, Link2, ListChecks, MessageSquarePlus, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { Popover } from "radix-ui";
import { memo, startTransition, type ReactNode, useCallback, useEffect, useMemo, useOptimistic, useRef, useState } from "react";
import { addNoteAction, createShareLinkAction, reviewReelAction, setMomentDoneAction } from "@/app/dashboard/review-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { requiredHold, formatHold } from "@/lib/asci";
import { extent, type FinerDetails, fixList, type Moment } from "@/lib/details";
import { premiereMarkersCsv } from "@/lib/exports";
import { formatTimecode } from "@/lib/format";
import { type Report, verdictStatus } from "@/lib/report";
import type { ReelCaption, ReelNote, ReelReview } from "@/lib/review";
import type { SceneData } from "@/lib/scene";
import { cn } from "@/lib/utils";
import { type Clock, createClock, elapsedText, useElapsed, useTimeStep } from "./clock";
import { brandMentions, brandWords, fixesAt, frameTimecode, indexScene, inStretches, motionWord, nextStop, type ReframeAspect, readoutAt, type SceneIndex, stopsFrom, trackAt, handsAt, bodyAt } from "./geometry";
import { Monitor } from "./monitor";
import { LAYER_COLOR, type LayerId, type Layers } from "./overlay";
import { copyText, Gated, RetryForm, SidePanel } from "./side";
import { EyeSwap, StudioTimeline } from "./timeline";
import { useTransport } from "./use-transport";
import "./studio.css";

const LAYERS: { id: LayerId; name: string; needs: "scene" | "kit" | "report" | "fixes" }[] = [
  { id: "silhouette", name: "Silhouette", needs: "scene" },
  { id: "spine", name: "Spine", needs: "scene" },
  { id: "face", name: "Face", needs: "scene" },
  { id: "hands", name: "Hands", needs: "scene" },
  { id: "product", name: "Product", needs: "scene" },
  { id: "logo", name: "Logo", needs: "scene" },
  { id: "ghost", name: "Ghost logo", needs: "kit" },
  { id: "label", name: "Label", needs: "report" },
  { id: "safe", name: "Reels safe zones", needs: "report" },
  { id: "fixes", name: "Fixes", needs: "fixes" },
];

const DEFAULT_LAYERS: Layers = { silhouette: true, spine: true, face: false, hands: false, product: true, logo: true, ghost: false, label: false, safe: false, fixes: false };

type SceneStatus = "loading" | "reading" | "none" | "failed" | "done";

interface SceneState {
  status: SceneStatus;
  scene: SceneData | null;
  since: string | null;
  error: string | null;
}

const SCENE_POLL_MS = 4000;
const OFFLINE = "Couldn't reach the server. Try again.";

/** Fetches the scene, and keeps asking while the job runs. */
function useScene(url: string): SceneState {
  const [state, setState] = useState<SceneState>({ status: "loading", scene: null, since: null, error: null });
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const ask = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.status === 200) {
          const scene = (await response.json()) as SceneData;
          if (alive) setState({ status: "done", scene, since: null, error: null });
          return;
        }
        const body = (await response.json().catch(() => null)) as { started_at?: string | null; error?: string | null } | null;
        if (!alive) return;
        if (response.status === 202) {
          setState({ status: "reading", scene: null, since: body?.started_at ?? null, error: null });
          timer = setTimeout(ask, SCENE_POLL_MS);
        } else if (response.status === 409) {
          setState({ status: "failed", scene: null, since: null, error: body?.error ?? null });
        } else {
          setState({ status: "none", scene: null, since: null, error: null });
        }
      } catch {
        // A dropped connection isn't a failed job; ask again.
        if (alive) timer = setTimeout(ask, 2 * SCENE_POLL_MS);
      }
    };
    void ask();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url]);
  return state;
}

export interface StudioProps {
  reelId: string;
  details: FinerDetails | null;
  job: { status: "reading" | "done" | "error"; error?: string | null; started_at: string };
  report: Report;
  brandFont: string;
  review: ReelReview | null;
  notes: ReelNote[];
  done: string[];
  readOnly: boolean;
  shareToken?: string;
  back: { href: string; label: string };
  /** The kit's product names, for finding them in the transcript. */
  products?: string[];
  /** Hidden for anyone but the brand that owns the folder, the only one who can answer. */
  canReview?: boolean;
  caption?: ReelCaption | null;
  /** The shell's banner sits under the Studio, so the sample's label is shown again here. */
  banner?: string | null;
}

export function Studio({ reelId, details, job, report, brandFont, review, notes, done, readOnly, shareToken, back, products, canReview = true, caption = null, banner = null }: StudioProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clock] = useState(createClock);
  const sceneState = useScene(`/api/reels/${reelId}/scene`);
  const { scene } = sceneState;
  const ix = useMemo(() => (scene ? indexScene(scene) : null), [scene]);

  const moments = useMemo(() => details?.moments ?? [], [details]);
  const duration = details?.reel.duration_s || report.video.duration_s || scene?.duration_s || 0;
  const frameW = details?.reel.width || report.video.width || scene?.width || 9;
  const frameH = details?.reel.height || report.video.height || scene?.height || 16;
  const filename = details?.reel.filename ?? report.video.filename;
  const videoSrc = details?.reel.video[0]?.src ?? `/api/reels/${reelId}/video`;
  const needed = requiredHold(duration).seconds;
  const labelSpans = useMemo(() => report.tracks.filter((track) => track.kind === "disclosure_label").flatMap((track) => track.spans), [report]);
  const mentions = useMemo(() => brandMentions(report.transcript, brandWords(details?.brand.name ?? "", products ?? [])), [report, details, products]);

  const transport = useTransport(videoRef, clock, duration);
  const { seek, play, setLoop, loop } = transport;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMoment = moments.find((m) => m.id === selectedId) ?? moments[0] ?? null;
  const selected = useMemo(() => (selectedMoment ? { moment: selectedMoment, n: moments.indexOf(selectedMoment) + 1 } : null), [selectedMoment, moments]);
  const [hot, setHot] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [reframe, setReframe] = useState<ReframeAspect | null>(null);
  const [scaleUp, setScaleUp] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [wipeStart, setWipeStart] = useState({ percent: 50 });
  const [range, setRange] = useState<{ in: number | null; out: number | null }>({ in: null, out: null });
  const [showKeys, setShowKeys] = useState(false);

  // Held here and not with useOptimistic: marking done doesn't refresh the page, so the prop wouldn't catch up.
  const [doneList, setDoneList] = useState(done);
  const [doneFromServer, setDoneFromServer] = useState(done);
  if (doneFromServer !== done) {
    setDoneFromServer(done);
    setDoneList(done);
  }
  const doneSet = useMemo(() => new Set(doneList), [doneList]);
  const [optimisticNotes, setOptimisticNotes] = useOptimistic(notes);
  const [optimisticReview, setOptimisticReview] = useOptimistic(review);

  const toggleLayer = useCallback((id: LayerId) => setLayers((known) => ({ ...known, [id]: !known[id] })), []);
  const hasFixes = moments.some((m) => m.fix);
  const noFixes = "This read has no fixes to show";
  const setFixView = useCallback((view: "posted" | "ab" | "fixed") => {
    setLayers((known) => ({ ...known, fixes: view !== "posted" }));
    setWipe(view === "ab");
    if (view === "ab") setWipeStart({ percent: 50 });
  }, []);

  // On a phone the side panel is below the monitor, so what it asks for could otherwise play off screen.
  const revealMonitor = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const { top, bottom } = video.getBoundingClientRect();
    if (bottom < 64 || top > window.innerHeight - 64) video.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  const seekFromSide = useCallback(
    (t: number) => {
      seek(t);
      revealMonitor();
    },
    [seek, revealMonitor],
  );

  const chooseMoment = useCallback(
    (moment: Moment) => {
      setSelectedId(moment.id);
      if (!moment.spans.length) return;
      const span = extent(moment);
      setLoop({ start: span.t_start, end: span.t_end });
      seek(span.t_start, true);
      play();
      revealMonitor();
    },
    [setLoop, seek, play, revealMonitor],
  );

  const showFix = useCallback(
    (moment: Moment) => {
      setSelectedId(moment.id);
      setLayers((known) => ({ ...known, fixes: true }));
      setWipe(true);
      // Through the middle of the fix, so both sides of the wipe show something different.
      if (moment.fix) setWipeStart({ percent: (moment.fix.box[0] + moment.fix.box[2] / 2) * 100 });
      const span = moment.fix?.spans[0];
      if (!span) return;
      setLoop({ start: span.t_start, end: span.t_end });
      seek(span.t_start, true);
      play();
      revealMonitor();
    },
    [setLoop, seek, play, revealMonitor],
  );

  const setDone = useCallback(
    (id: string, next: boolean) => {
      const undo = () => setDoneList((known) => (next ? known.filter((d) => d !== id) : [...known, id]));
      setDoneList((known) => (next ? [...known, id] : known.filter((d) => d !== id)));
      void setMomentDoneAction(reelId, id, next)
        .then((result) => {
          if (!("error" in result)) return;
          undo();
          toast(result.error, { tone: "fail" });
        })
        .catch(() => {
          undo();
          toast(OFFLINE, { tone: "fail" });
        });
    },
    [reelId],
  );

  const noteGone = useCallback((id: string) => setOptimisticNotes((known) => known.filter((n) => n.id !== id)), [setOptimisticNotes]);

  const addNote = useCallback(
    (t: number, text: string) => {
      startTransition(async () => {
        setOptimisticNotes((known) => [...known, { id: `new-${t}`, reel_id: reelId, t, text, by_name: "You", at: new Date().toISOString() }].sort((a, b) => a.t - b.t));
        const result = await addNoteAction(reelId, t, text).catch(() => ({ error: OFFLINE }));
        if ("error" in result) toast(result.error, { tone: "fail" });
        else toast(`Note added at ${formatTimecode(t)}`, { tone: "ok" });
      });
    },
    [reelId, setOptimisticNotes],
  );

  const answer = useCallback(
    (status: ReelReview["status"], note: string) => {
      startTransition(async () => {
        setOptimisticReview({ status, note: note || null, by_name: "You", at: new Date().toISOString() });
        const result = await reviewReelAction(reelId, status, note).catch(() => ({ error: OFFLINE }));
        if ("error" in result) toast(result.error, { tone: "fail" });
        else toast(status === "approved" ? "Approved" : "Changes requested", { tone: "ok" });
      });
    },
    [reelId, setOptimisticReview],
  );

  const downloadStill = useCallback(
    (t: number) => {
      const video = videoRef.current;
      if (!video) return;
      transport.pause();
      const save = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width) {
          toast("The video hasn't loaded yet.", { tone: "fail" });
          return;
        }
        ctx.drawImage(video, 0, 0);
        try {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                toast("Couldn't make the still.", { tone: "fail" });
                return;
              }
              saveBlob(blob, `${filename.replace(/\.[^.]+$/, "")}-cover-${t.toFixed(1)}s.jpg`);
              toast("Still downloaded", { tone: "ok" });
            },
            "image/jpeg",
            0.92,
          );
        } catch {
          toast("The browser wouldn't let this video be saved as a still.", { tone: "fail" });
        }
      };
      if (Math.abs(video.currentTime - t) < 0.02) {
        save();
        return;
      }
      video.addEventListener("seeked", save, { once: true });
      seek(t);
    },
    [transport, seek, filename],
  );

  const stops = useMemo(() => stopsFrom([...moments.flatMap((m) => (m.spans.length ? [extent(m).t_start] : [])), ...optimisticNotes.map((n) => n.t)]), [moments, optimisticNotes]);

  const cycleLoop = useCallback(() => {
    if (loop) {
      setLoop(null);
    } else if (range.in !== null || range.out !== null) {
      setLoop({ start: range.in ?? 0, end: range.out ?? duration });
    } else if (selected?.moment.spans.length) {
      const span = extent(selected.moment);
      setLoop({ start: span.t_start, end: span.t_end });
      seek(span.t_start, true);
    } else {
      setLoop({ start: 0, end: duration });
    }
  }, [loop, range, selected, duration, setLoop, seek]);

  // The editor's keys. Nothing here animates. A button that has keyboard focus keeps its own space bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest?.("input:not([type=range]),textarea,select,[contenteditable]")) return;
      if (e.key === "?") {
        setShowKeys((open) => !open);
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        setShowKeys(false);
        return;
      }
      if (target.closest?.("[role=menu],[role=dialog]")) return;
      if (e.key === " " && target.closest?.("a,button,[role=tab],[role=slider]") && target.matches(":focus-visible")) return;
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && target.closest?.("input,[role=tab],[role=slider]")) return;
      switch (e.key) {
        case " ":
          transport.toggle();
          break;
        case "k":
        case "K":
          transport.pause();
          break;
        case "l":
        case "L":
          transport.shuttleForward();
          break;
        case "j":
        case "J":
          transport.shuttleBack();
          break;
        case "ArrowLeft":
          transport.stepFrame(-1);
          break;
        case "ArrowRight":
          transport.stepFrame(1);
          break;
        case "i":
        case "I":
          setRange((known) => ({ in: clock.t, out: known.out !== null && known.out > clock.t ? known.out : null }));
          break;
        case "o":
        case "O":
          setRange((known) => ({ in: known.in !== null && known.in < clock.t ? known.in : null, out: clock.t }));
          break;
        case ",":
        case ".": {
          const stop = nextStop(stops, clock.t, e.key === "," ? -1 : 1);
          if (stop !== null) seek(stop);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [transport, clock, stops, seek]);

  const clearRange = useCallback(() => setRange({ in: null, out: null }), []);
  const sceneStatusNode = <SceneChip state={sceneState} reelId={reelId} readOnly={readOnly} />;

  return (
    <div className="studio" data-theme="dark">
      <TopBar
        reelId={reelId}
        back={back}
        filename={filename}
        details={details}
        report={report}
        notes={optimisticNotes}
        review={optimisticReview}
        readOnly={readOnly}
        canReview={canReview}
        shareToken={shareToken}
        banner={banner}
        onAnswer={answer}
        onShowKeys={() => setShowKeys(true)}
      />
      <div className="st-body">
        <div className="st-left">
          <div className="st-program">
            <LayersPanel layers={layers} onToggle={toggleLayer} ix={ix} clock={clock} logo={details?.brand.logo ?? ""} moments={moments} labelSpans={labelSpans} sceneStatus={sceneState.status} />
            <div className="st-monitor">
              <div className="st-mon-bar">
                <span className="st-panel-name">Program</span>
                <div className="st-seg" role="group" aria-label="What the monitor shows">
                  <button type="button" aria-pressed={!layers.fixes} onClick={() => setFixView("posted")}>
                    As posted
                  </button>
                  <button type="button" aria-pressed={layers.fixes && wipe} disabled={!hasFixes} title={hasFixes ? "Wipe between the Reel as posted and with its fixes" : noFixes} onClick={() => setFixView("ab")}>
                    A/B
                  </button>
                  <button type="button" aria-pressed={layers.fixes && !wipe} disabled={!hasFixes} title={hasFixes ? undefined : noFixes} onClick={() => setFixView("fixed")}>
                    With fixes
                  </button>
                </div>
                <div className="st-seg" role="group" aria-label="Auto-reframe preview">
                  <button
                    type="button"
                    aria-pressed={reframe === null}
                    onClick={() => {
                      setReframe(null);
                      setScaleUp(false);
                    }}
                  >
                    9:16
                  </button>
                  {(["1:1", "4:5"] as const).map((aspect) => (
                    <button key={aspect} type="button" aria-pressed={reframe === aspect} disabled={!ix} title={ix ? `Auto-reframe to ${aspect}, following the body` : "Reframing needs tracking"} onClick={() => setReframe(aspect)}>
                      {aspect}
                    </button>
                  ))}
                </div>
                <button type="button" className="st-text-toggle" aria-pressed={scaleUp} disabled={!reframe} onClick={() => setScaleUp((on) => !on)}>
                  Scale up
                </button>
              </div>
              <Monitor
                src={videoSrc}
                poster={details?.reel.poster}
                filename={filename}
                width={frameW}
                height={frameH}
                videoRef={videoRef}
                clock={clock}
                ix={ix}
                layers={layers}
                selected={selected}
                moments={moments}
                brand={details?.brand ?? null}
                brandFont={brandFont}
                labelSpans={labelSpans}
                wipe={wipe}
                wipeStart={wipeStart}
                reframe={reframe}
                scaleUp={scaleUp}
                onToggle={transport.toggle}
              />
              <TransportBar transport={transport} clock={clock} duration={duration} selected={selected?.moment ?? null} onLoop={cycleLoop} onNote={addNote} readOnly={readOnly} />
            </div>
            <InspectorPanel ix={ix} report={report} clock={clock} sceneStatus={sceneState.status} needed={needed} />
          </div>
          <StudioTimeline
            duration={duration}
            scene={scene}
            report={report}
            needed={needed}
            mentions={mentions}
            moments={moments}
            notes={optimisticNotes}
            clock={clock}
            onSeek={seek}
            onMoment={chooseMoment}
            selected={selected?.moment.id ?? null}
            hot={hot}
            onHot={setHot}
            range={range}
            onClearRange={clearRange}
            loop={loop}
            status={sceneStatusNode}
            emptyNote={EMPTY_NOTE[sceneState.status] ?? null}
          />
        </div>
        <SidePanel
          reelId={reelId}
          details={details}
          job={job}
          report={report}
          scene={scene}
          sceneStatus={sceneState.status}
          sceneError={sceneState.error}
          sceneSince={sceneState.since}
          mentions={mentions}
          notes={optimisticNotes}
          done={doneSet}
          readOnly={readOnly}
          caption={caption}
          clock={clock}
          selected={selected?.moment.id ?? null}
          hot={hot}
          onHot={setHot}
          onChoose={chooseMoment}
          onSeek={seekFromSide}
          onShowFix={showFix}
          onDone={setDone}
          onStill={downloadStill}
          onNoteGone={noteGone}
        />
      </div>
      {showKeys ? <KeysOverlay onClose={() => setShowKeys(false)} /> : null}
    </div>
  );
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SceneChip({ state, reelId, readOnly }: { state: SceneState; reelId: string; readOnly: boolean }) {
  const seconds = useElapsed(state.status === "reading" ? state.since : null);
  if (state.status === "reading") {
    return (
      <span className="st-scene-chip" aria-live="polite">
        <span className="st-pulse" aria-hidden="true" />
        Tracking with SAM 3.1
        <span className="st-state-time">{elapsedText(seconds)}</span>
      </span>
    );
  }
  if (state.status === "done" && state.scene) {
    const { scene } = state;
    return (
      <span className="st-scene-chip st-scene-done">
        SAM 3.1 at {scene.fps} fps
        {scene.failed.length ? `. Couldn't track: ${scene.failed.join(", ")}` : ""}
      </span>
    );
  }
  if (state.status === "failed" || state.status === "none") {
    return (
      <>
        <span className={cn("st-scene-chip", state.status === "failed" && "st-scene-failed")}>{state.status === "failed" ? `Tracking failed${state.error ? `: ${state.error}` : ""}` : "No tracking for this Reel"}</span>
        <RetryForm reelId={reelId} readOnly={readOnly} label="Read again" />
      </>
    );
  }
  return null;
}

const EMPTY_NOTE: Partial<Record<SceneStatus, string>> = {
  reading: "These tracks and the layers above fill in when tracking finishes. Everything else works now.",
  none: "This Reel was read before tracking existed. Read it again to get these tracks and the layers above.",
  failed: "No tracks this time. The label, speech and notes below come from the report, so they're still here.",
};

function TopBar({
  reelId,
  back,
  filename,
  details,
  report,
  notes,
  review,
  readOnly,
  canReview,
  shareToken,
  banner,
  onAnswer,
  onShowKeys,
}: {
  reelId: string;
  back: { href: string; label: string };
  filename: string;
  details: FinerDetails | null;
  report: Report;
  notes: ReelNote[];
  review: ReelReview | null;
  readOnly: boolean;
  canReview: boolean;
  shareToken?: string;
  banner: string | null;
  onAnswer: (status: ReelReview["status"], note: string) => void;
  onShowKeys: () => void;
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  const copyFixes = async () => {
    if (!details) return;
    await copyText(fixList(details, formatTimecode));
    toast("Fixes copied", { tone: "ok" });
  };
  const csv = () => {
    if (!details) return;
    saveBlob(new Blob([premiereMarkersCsv(details, notes)], { type: "text/csv" }), `${filename.replace(/\.[^.]+$/, "")}-markers.csv`);
    toast("Premiere markers downloaded", { tone: "ok" });
  };
  const share = async () => {
    const url = shareToken ? `${window.location.origin}/share/${shareToken}` : null;
    const answer = url ? { url } : await createShareLinkAction(reelId).catch(() => ({ error: OFFLINE }));
    if ("error" in answer) {
      toast(answer.error, { tone: "fail" });
      return;
    }
    await copyText(answer.url);
    toast("Share link copied", { tone: "ok" });
  };

  return (
    <header className="st-top">
      <Link href={back.href} className="st-back" aria-label={`Back to ${back.label}`}>
        <ArrowLeft size={15} aria-hidden="true" />
      </Link>
      <div className="st-top-title">
        <span className="st-top-name">Finer details</span>
        <span className="st-file" title={filename}>
          {filename}
        </span>
        {details?.brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={details.brand.logo} alt={details.brand.name} className="st-kit-logo" />
        ) : null}
        <StatusBadge status={verdictStatus(report.verdict)} />
        {review ? (
          <span className="st-review" data-status={review.status} title={review.note ?? undefined}>
            <Check size={12} aria-hidden="true" />
            {review.status === "approved" ? "Approved" : "Changes requested"} by {review.by_name}
          </span>
        ) : null}
      </div>
      {banner ? <p className="st-banner">{banner}</p> : null}
      <div className="st-top-actions">
        {canReview ? (
          <>
            <Gated readOnly={readOnly}>
              <Button size="compact-sm" disabled={readOnly || review?.status === "approved"} onClick={() => onAnswer("approved", "")}>
                <Check size={14} aria-hidden="true" />
                Approve
              </Button>
            </Gated>
            <Popover.Root open={changesOpen} onOpenChange={setChangesOpen}>
              <Gated readOnly={readOnly}>
                <Popover.Trigger asChild>
                  <Button size="compact-sm" variant="secondary" disabled={readOnly}>
                    Request changes
                  </Button>
                </Popover.Trigger>
              </Gated>
              <Popover.Portal>
                <Popover.Content data-theme="dark" className="st-pop" align="end" sideOffset={6}>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = changeNote.trim();
                      if (!text) return;
                      onAnswer("changes", text);
                      setChangesOpen(false);
                      setChangeNote("");
                    }}
                  >
                    <label className="st-pop-label" htmlFor="st-change-note">
                      What should change?
                    </label>
                    <textarea id="st-change-note" className="st-textarea" rows={3} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
                    <Button type="submit" size="compact-sm" disabled={!changeNote.trim()}>
                      Send to the creator
                    </Button>
                  </form>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="compact-sm" variant="secondary">
              Export
              <ChevronDown size={14} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent data-theme="dark" align="end" sideOffset={6} className="st-menu">
            <DropdownMenuItem disabled={!details?.moments.length} onSelect={copyFixes}>
              <ListChecks size={14} aria-hidden="true" />
              Copy the fixes
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!details} onSelect={csv}>
              <FileDown size={14} aria-hidden="true" />
              Premiere markers (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={readOnly} onSelect={share}>
              <Link2 size={14} aria-hidden="true" />
              {readOnly ? "Share link: not on the public sample" : "Share link for the creator"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className="st-tool" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={onShowKeys}>
          <CircleHelp size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

const LayersPanel = memo(function LayersPanel({
  layers,
  onToggle,
  ix,
  clock,
  logo,
  moments,
  labelSpans,
  sceneStatus,
}: {
  layers: Layers;
  onToggle: (id: LayerId) => void;
  ix: SceneIndex | null;
  clock: Clock;
  logo: string;
  moments: Moment[];
  labelSpans: { t_start: number; t_end: number }[];
  sceneStatus: SceneStatus;
}) {
  const t = useTimeStep(clock, 0.1);
  const hasFixes = moments.some((m) => m.fix);
  const available = (needs: (typeof LAYERS)[number]["needs"]) => {
    if (needs === "scene") return Boolean(ix);
    if (needs === "kit") return Boolean(ix && logo);
    if (needs === "fixes") return hasFixes;
    return true;
  };
  const present: Record<LayerId, boolean> = {
    silhouette: Boolean(ix && bodyAt(ix, t)),
    spine: Boolean(ix && bodyAt(ix, t)?.spine),
    face: Boolean(ix && trackAt(ix.face, t, ix.scene.shots, ix.trackStep)),
    hands: Boolean(ix && handsAt(ix, t).length),
    product: Boolean(ix && trackAt(ix.product, t, ix.scene.shots, ix.trackStep)),
    logo: Boolean(ix && trackAt(ix.logo, t, ix.scene.shots, ix.trackStep)),
    ghost: Boolean(ix && logo && inStretches(ix.scene.lanes.logoMissing, t)),
    label: inStretches(labelSpans, t),
    safe: true,
    fixes: fixesAt(moments, t, null).length > 0,
  };
  return (
    <section className="st-layers" aria-label="Layers">
      <div className="st-panel-head">
        <span className="st-panel-name">Layers</span>
        {sceneStatus === "reading" ? <span className="st-panel-note">Fills in after tracking</span> : null}
      </div>
      <ul>
        {LAYERS.map(({ id, name, needs }) => {
          const can = available(needs);
          const on = layers[id];
          return (
            <li key={id} data-off={!on || undefined} data-unavailable={!can || undefined}>
              <button
                type="button"
                className="st-layer"
                aria-pressed={on}
                aria-label={`${on ? "Hide" : "Show"} ${name}`}
                disabled={!can}
                title={can ? undefined : needs === "fixes" ? "This read has no fixes" : needs === "kit" ? "Needs tracking and a logo in the kit" : "Needs tracking"}
                onClick={() => onToggle(id)}
              >
                <span className="st-layer-dot" data-here={(can && present[id]) || undefined} style={{ ["--dot" as string]: LAYER_COLOR[id] }} />
                <span className="st-layer-name">{name}</span>
                <span className="st-eye">
                  <EyeSwap off={!on} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="st-layers-foot">A filled square means it&rsquo;s in this frame.</p>
    </section>
  );
});

const InspectorPanel = memo(function InspectorPanel({ ix, report, clock, sceneStatus, needed }: { ix: SceneIndex | null; report: Report; clock: Clock; sceneStatus: SceneStatus; needed: number }) {
  const t = useTimeStep(clock, 0.1);
  const r = readoutAt(ix, report, t);
  const none = sceneStatus === "reading" ? "Tracking" : sceneStatus === "loading" ? "..." : "Not tracked";
  const yesNo = (v: boolean | null, yes: string, no: string) => (v === null ? none : v ? yes : no);
  const rows: [string, ReactNode][] = [
    ["Shot", r.shot === null ? none : `${r.shot} of ${r.shots}`],
    ["Creator", yesNo(r.creator, "On camera", "Off camera")],
    ["Product box", r.productShare === null ? none : r.productShare > 0 ? `${(r.productShare * 100).toFixed(1)}% of frame` : "Not in frame"],
    ["Logo", yesNo(r.logoSeen, "Seen", "Not seen")],
    [
      "Motion",
      r.motion === null ? (
        none
      ) : (
        <span className="st-motion">
          <span className="st-motion-bar">
            <span style={{ transform: `scaleX(${r.motion})` }} />
          </span>
          {motionWord(r.motion)}
        </span>
      ),
    ],
    ["Label", r.labelOn ? "On screen" : "Not on screen"],
    ["Hold needed", formatHold(needed)],
    [
      "Clause",
      r.clause ? (
        <span title={r.clause.note}>
          {r.clause.code.replace("ASCI-IG ", "")}
          {r.clause.here ? " here" : ""}
        </span>
      ) : (
        "None"
      ),
    ],
  ];
  return (
    <section className="st-inspector" aria-label="Frame inspector">
      <div className="st-panel-head">
        <span className="st-panel-name">Inspector</span>
        <span className="st-panel-note st-mono">{formatTimecode(t)}</span>
      </div>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {ix ? (
        <p className="st-inspector-foot">
          Tracked, not estimated. Product followed as &ldquo;{ix.scene.phrases.product}&rdquo;.
        </p>
      ) : null}
    </section>
  );
});

function TransportBar({
  transport,
  clock,
  duration,
  selected,
  onLoop,
  onNote,
  readOnly,
}: {
  transport: ReturnType<typeof useTransport>;
  clock: Clock;
  duration: number;
  selected: Moment | null;
  onLoop: () => void;
  onNote: (t: number, text: string) => void;
  readOnly: boolean;
}) {
  const { playing, speed, muted, loop, seek, toggle, stepFrame, setSpeed, toggleMute } = transport;
  const timeRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const show = (t: number) => {
      if (timeRef.current) timeRef.current.textContent = frameTimecode(t);
    };
    show(clock.t);
    return clock.on(show);
  }, [clock]);
  return (
    <div className="st-transport" role="group" aria-label="Transport">
      <div className="st-tp-group">
        <button type="button" className="st-tool" aria-label="Go to the start" onClick={() => seek(0)}>
          <SkipBack size={15} aria-hidden="true" />
        </button>
        <button type="button" className="st-tool" aria-label="Back one frame" onClick={() => stepFrame(-1)}>
          <StepBack size={15} aria-hidden="true" />
        </button>
        <button type="button" className="st-play" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
          {playing ? <Pause size={16} aria-hidden="true" fill="currentColor" /> : <Play size={16} aria-hidden="true" fill="currentColor" />}
        </button>
        <button type="button" className="st-tool" aria-label="Forward one frame" onClick={() => stepFrame(1)}>
          <StepForward size={15} aria-hidden="true" />
        </button>
        <button type="button" className="st-tool" aria-label="Go to the end" onClick={() => seek(duration)}>
          <SkipForward size={15} aria-hidden="true" />
        </button>
        <button type="button" className="st-tool" aria-pressed={Boolean(loop)} aria-label={loop ? "Stop looping" : selected ? "Loop the selected moment" : "Loop"} title={loop ? `Looping ${formatTimecode(loop.start)} to ${formatTimecode(loop.end)}` : "Loop the range, or the selected moment"} onClick={onLoop}>
          <Repeat size={15} aria-hidden="true" />
        </button>
      </div>
      <p className="st-time">
        <span ref={timeRef}>00:00:00</span>
        <span className="st-time-total">/ {frameTimecode(duration)}</span>
      </p>
      <div className="st-tp-group st-tp-right">
        <div className="st-seg" role="group" aria-label="Speed">
          {[0.5, 1, 2].map((value) => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
              {value}x
            </button>
          ))}
        </div>
        <button type="button" className="st-tool" aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          {muted ? <VolumeX size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
        </button>
        <AddNote clock={clock} onNote={onNote} readOnly={readOnly} />
      </div>
    </div>
  );
}

function AddNote({ clock, onNote, readOnly }: { clock: Clock; onNote: (t: number, text: string) => void; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [text, setText] = useState("");
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setAt(clock.t);
        setOpen(next);
      }}
    >
      <Gated readOnly={readOnly}>
        <Popover.Trigger asChild>
          <button type="button" className="st-tool st-tool-text" disabled={readOnly}>
            <MessageSquarePlus size={14} aria-hidden="true" />
            Note
          </button>
        </Popover.Trigger>
      </Gated>
      <Popover.Portal>
        <Popover.Content data-theme="dark" className="st-pop" side="top" align="end" sideOffset={6}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = text.trim();
              if (!value) return;
              onNote(at, value);
              setText("");
              setOpen(false);
            }}
          >
            <label className="st-pop-label" htmlFor="st-note-text">
              Note at <span className="st-mono">{formatTimecode(at)}</span>
            </label>
            <textarea
              id="st-note-text"
              className="st-textarea"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" size="compact-sm" disabled={!text.trim()}>
              Add note
            </Button>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const KEYS: [string, string][] = [
  ["Space", "Play or pause"],
  ["J", "Play backwards"],
  ["K", "Pause"],
  ["L", "Play forwards, press again for faster"],
  ["Left, Right", "One frame back or forward"],
  ["I, O", "Set the in and out of a range"],
  [", .", "Previous or next note"],
  ["?", "This list"],
];

function KeysOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="st-keys-scrim" onClick={onClose}>
      <div ref={(el) => el?.focus()} tabIndex={-1} role="dialog" aria-label="Keyboard shortcuts" className="st-keys" onClick={(e) => e.stopPropagation()}>
        <div className="st-panel-head">
          <span className="st-panel-name">
            <Keyboard size={13} aria-hidden="true" /> Keys
          </span>
          <button type="button" className="st-tool" aria-label="Close" onClick={onClose}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <dl>
          {KEYS.map(([key, what]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}


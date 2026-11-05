"use client";

import { Eye, EyeOff, Maximize2, Minus, Plus, X } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { extent, type Moment, type MomentKind, MOTION_STEP_S } from "@/lib/details";
import { formatRange, formatTimecode } from "@/lib/format";
import type { ReelNote } from "@/lib/review";
import type { Report } from "@/lib/report";
import type { SceneData } from "@/lib/scene";
import { cn } from "@/lib/utils";
import type { Clock } from "./clock";
import { type BrandMention, clamp, EDIT_FPS, frameTimecode, placeMarkers, zoomedScroll } from "./geometry";
import { describeTime, drawAudio, drawFilmstrip, drawLabel, drawLane, drawLogo, drawMotion, drawProduct, drawRuler, drawShots, drawSpeech, drawWaiting, type TrackView } from "./tracks";

type TrackId = "film" | "shots" | "label" | "creator" | "product" | "logo" | "motion" | "audio" | "speech" | "notes";

const ROWS: { id: TrackId; name: string; h: number; short: number; needsScene: boolean }[] = [
  { id: "film", name: "Filmstrip", h: 40, short: 28, needsScene: true },
  { id: "shots", name: "Shots", h: 14, short: 12, needsScene: true },
  { id: "label", name: "Label", h: 20, short: 18, needsScene: false },
  { id: "creator", name: "Creator", h: 13, short: 10, needsScene: true },
  { id: "product", name: "Product", h: 13, short: 10, needsScene: true },
  { id: "logo", name: "Logo", h: 13, short: 10, needsScene: true },
  { id: "motion", name: "Motion", h: 24, short: 16, needsScene: true },
  { id: "audio", name: "Audio", h: 28, short: 18, needsScene: true },
  { id: "speech", name: "Speech", h: 18, short: 16, needsScene: false },
  { id: "notes", name: "Notes", h: 24, short: 24, needsScene: false },
];
const RULER_H = 24;
const ROW_GAP = 1;
const MAX_ZOOM = 24;
const MARKER_SPACING = 18;

const SHORT_WINDOW = "(max-height: 820px)";
const subscribeShort = (onChange: () => void) => {
  const media = window.matchMedia(SHORT_WINDOW);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

interface Marker {
  key: string;
  t: number;
  kind: "moment" | "note";
  momentKind?: MomentKind;
  id: string;
  n: number;
  text: string;
}

export interface StudioTimelineProps {
  duration: number;
  scene: SceneData | null;
  report: Report;
  needed: number;
  mentions: BrandMention[];
  moments: Moment[];
  notes: ReelNote[];
  clock: Clock;
  onSeek: (t: number) => void;
  onMoment: (moment: Moment) => void;
  selected: string | null;
  hot: string | null;
  onHot: (id: string | null) => void;
  range: { in: number | null; out: number | null };
  onClearRange: () => void;
  loop: { start: number; end: number } | null;
  status: ReactNode;
  /** Said across the empty rows while there's no scene. */
  emptyNote: string | null;
}

export const StudioTimeline = memo(function StudioTimeline({ duration, scene, report, needed, mentions, moments, notes, clock, onSeek, onMoment, selected, hot, onHot, range, onClearRange, loop, status, emptyNote }: StudioTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const flagRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeRef = useRef<HTMLSpanElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const canvases = useRef<Partial<Record<TrackId | "ruler", HTMLCanvasElement | null>>>({});
  const [viewW, setViewW] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [hidden, setHidden] = useState<Set<TrackId>>(() => new Set());
  const [sprite, setSprite] = useState<HTMLImageElement | null>(null);
  const [revealDone, setRevealDone] = useState(false);
  const pendingScroll = useRef<number | null>(null);
  const short = useSyncExternalStore(subscribeShort, () => window.matchMedia(SHORT_WINDOW).matches, () => false);
  const rows = useMemo(() => ROWS.map((row) => ({ ...row, h: short ? row.short : row.h })), [short]);
  const dragging = useRef(false);
  const lastPointer = useRef("mouse");
  const safeDuration = duration > 0 ? duration : 1;
  const pps = viewW ? (viewW / safeDuration) * zoom : 1;
  const contentW = Math.max(viewW, Math.ceil(safeDuration * pps));

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewW(el.clientWidth));
    observer.observe(el);
    setViewW(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const spriteSrc = scene?.sprite.src;
  useEffect(() => {
    if (!spriteSrc) return;
    const image = new Image();
    image.onload = () => setSprite(image);
    image.src = spriteSrc;
  }, [spriteSrc]);

  // After the first reveal the rows stop waiting for their stagger, so the eye toggles answer at once.
  const hasScene = Boolean(scene);
  useEffect(() => {
    if (!hasScene) return;
    const timer = setTimeout(() => setRevealDone(true), ROWS.length * 45 + 320);
    return () => clearTimeout(timer);
  }, [hasScene]);

  const labelSpans = useMemo(() => report.tracks.filter((track) => track.kind === "disclosure_label").flatMap((track) => track.spans), [report]);

  const paint = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !viewW) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
    const t0 = scroller.scrollLeft / pps;
    const setUp = (id: TrackId | "ruler", height: number): [CanvasRenderingContext2D, TrackView] | null => {
      const canvas = canvases.current[id];
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return null;
      const w = Math.round(viewW * dpr);
      const h = Math.round(height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, height);
      return [ctx, { t0, pps, width: viewW, height, duration: safeDuration, mono, dpr }];
    };
    const ruler = setUp("ruler", RULER_H);
    if (ruler) drawRuler(...ruler);
    for (const row of rows) {
      const set = setUp(row.id, row.h);
      if (!set) continue;
      const [ctx, view] = set;
      if (row.needsScene && !scene) {
        drawWaiting(ctx, view);
        continue;
      }
      switch (row.id) {
        case "film":
          if (sprite && scene) drawFilmstrip(ctx, view, sprite, scene.sprite);
          break;
        case "shots":
          if (scene) drawShots(ctx, view, scene.shots);
          break;
        case "label":
          drawLabel(ctx, view, labelSpans, needed);
          break;
        case "creator":
          if (scene) drawLane(ctx, view, scene.lanes.creator, "#48bcc6");
          break;
        case "product":
          if (scene) drawProduct(ctx, view, scene.lanes);
          break;
        case "logo":
          if (scene) drawLogo(ctx, view, scene.lanes);
          break;
        case "motion":
          if (scene) drawMotion(ctx, view, scene.motion, MOTION_STEP_S);
          break;
        case "audio":
          if (scene) drawAudio(ctx, view, scene.waveform);
          break;
        case "speech":
          drawSpeech(ctx, view, report.transcript, mentions);
          break;
      }
    }
  }, [viewW, pps, safeDuration, scene, sprite, labelSpans, needed, report.transcript, mentions, rows]);

  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && paint());
    return () => {
      alive = false;
    };
  }, [paint]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && pendingScroll.current !== null) {
      scroller.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
    paint();
  }, [paint, contentW]);

  // The playhead follows the clock with no React in between, and pages the view along when zoomed in.
  useEffect(() => {
    const flag = flagRef.current;
    const half = (flag?.offsetWidth ?? 0) / 2;
    const move = (t: number) => {
      const x = t * pps;
      if (playheadRef.current) playheadRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
      if (flag) {
        flag.textContent = frameTimecode(t);
        flag.style.transform = `translate3d(${clamp(x - half, 0, contentW - 2 * half) - x}px, 0, 0)`;
      }
      const slider = sliderRef.current;
      const tenth = String(Math.round(t * 10) / 10);
      if (slider && slider.getAttribute("aria-valuenow") !== tenth) {
        slider.setAttribute("aria-valuenow", tenth);
        slider.setAttribute("aria-valuetext", formatTimecode(t));
      }
      const scroller = scrollRef.current;
      if (scroller && zoom > 1 && !dragging.current) {
        if (x > scroller.scrollLeft + viewW - 24 || x < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, x - 24);
      }
    };
    move(clock.t);
    return clock.on(move);
  }, [clock, pps, contentW, viewW, zoom]);

  const timeAt = (clientX: number) => {
    const rect = scrollRef.current?.getBoundingClientRect();
    const scroller = scrollRef.current;
    if (!rect || !scroller) return 0;
    return clamp((clientX - rect.left + scroller.scrollLeft) / pps, 0, safeDuration);
  };

  const applyZoom = useCallback(
    (next: number, anchorClientX?: number) => {
      const scroller = scrollRef.current;
      if (!scroller || !viewW) return;
      const value = clamp(next, 1, MAX_ZOOM);
      const rect = scroller.getBoundingClientRect();
      const playheadX = clock.t * pps - scroller.scrollLeft;
      const anchor = anchorClientX !== undefined ? anchorClientX - rect.left : playheadX >= 0 && playheadX <= viewW ? playheadX : viewW / 2;
      pendingScroll.current = zoomedScroll(scroller.scrollLeft, anchor, pps, (viewW / safeDuration) * value);
      setZoom(value);
    },
    [clock, pps, safeDuration, viewW],
  );

  // React's wheel listeners are passive, and pinch and ctrl-wheel have to stop the page zooming.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      applyZoom(zoom * Math.exp(-e.deltaY * 0.006), e.clientX);
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [applyZoom, zoom]);

  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = moments.map((m, i) => ({ key: `m-${m.id}`, t: extent(m).t_start, kind: "moment", momentKind: m.kind, id: m.id, n: i + 1, text: m.title }));
    for (const note of notes) list.push({ key: `n-${note.id}`, t: note.t, kind: "note", id: note.id, n: 0, text: note.text });
    return list.sort((a, b) => a.t - b.t);
  }, [moments, notes]);
  const markerXs = useMemo(() => placeMarkers(markers.map((m) => m.t), pps, MARKER_SPACING, contentW - MARKER_SPACING / 2), [markers, pps, contentW]);

  const bandMoment = moments.find((m) => m.id === hot) ?? moments.find((m) => m.id === selected);
  const band = bandMoment?.spans.length ? extent(bandMoment) : null;
  const rangeIn = range.in;
  const rangeOut = range.out;
  const toggleRow = (id: TrackId) =>
    setHidden((known) => {
      const next = new Set(known);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tracksHeight = RULER_H + rows.reduce((sum, row) => sum + row.h + ROW_GAP, 0);
  const notesTop = tracksHeight - rows[rows.length - 1].h - ROW_GAP;

  return (
    <section className="st-timeline" aria-label="Timeline">
      <div className="st-tl-bar">
        <span className="st-panel-name">Timeline</span>
        {status}
        {rangeIn !== null || rangeOut !== null ? (
          <span className="st-range">
            {rangeIn !== null ? `In ${formatTimecode(rangeIn)}` : ""}
            {rangeIn !== null && rangeOut !== null ? "  " : ""}
            {rangeOut !== null ? `Out ${formatTimecode(rangeOut)}` : ""}
            <button type="button" className="st-tool" aria-label="Clear the range" onClick={onClearRange}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <span ref={readoutRef} className="st-tl-readout" aria-hidden="true" />
        <div className="st-tl-zoom">
          <button type="button" className="st-tool" aria-label="Zoom out" onClick={() => applyZoom(zoom / 1.5)}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <input
            type="range"
            className="st-zoom"
            aria-label="Timeline zoom"
            min={0}
            max={1}
            step={0.01}
            value={Math.log(zoom) / Math.log(MAX_ZOOM)}
            onChange={(e) => applyZoom(MAX_ZOOM ** Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <button type="button" className="st-tool" aria-label="Zoom in" onClick={() => applyZoom(zoom * 1.5)}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button type="button" className="st-tool" aria-label="Fit the whole Reel" disabled={zoom === 1} onClick={() => applyZoom(1)}>
            <Maximize2 size={13} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="st-tl-grid" style={{ height: tracksHeight + 6 }}>
        <div className="st-tl-heads">
          <div className="st-tl-head-ruler" style={{ height: RULER_H }} />
          {rows.map((row) => {
            const off = hidden.has(row.id);
            return (
              <div key={row.id} className="st-tl-head" data-off={off || undefined} style={{ height: row.h, marginBottom: ROW_GAP }}>
                <span className="st-tl-name">{row.name}</span>
                <button type="button" className="st-eye" aria-pressed={!off} aria-label={`${off ? "Show" : "Hide"} the ${row.name} track`} onClick={() => toggleRow(row.id)}>
                  <EyeSwap off={off} />
                </button>
              </div>
            );
          })}
        </div>
        <div
          ref={scrollRef}
          className="st-tl-scroll"
          onScroll={paint}
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
            if (e.button !== 0) return;
            const onRuler = (e.target as HTMLElement).closest("[data-ruler]");
            // A finger on the rows scrolls the timeline sideways; on the ruler it scrubs.
            if (e.pointerType === "touch" && !onRuler) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientY > rect.bottom - 6) return; // the scrollbar
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            onSeek(timeAt(e.clientX));
          }}
          onPointerMove={(e) => {
            if (dragging.current && e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(timeAt(e.clientX));
            if (e.pointerType !== "mouse" || !hoverRef.current) return;
            const t = timeAt(e.clientX);
            hoverRef.current.style.transform = `translate3d(${t * pps}px, 0, 0)`;
            hoverRef.current.style.opacity = "1";
            if (hoverTimeRef.current) {
              hoverTimeRef.current.textContent = formatTimecode(t);
              // Near the right edge the readout sits on the line's other side.
              hoverTimeRef.current.dataset.flip = t * pps - e.currentTarget.scrollLeft > viewW - 52 ? "1" : "";
            }
            if (readoutRef.current) readoutRef.current.textContent = describeTime(t, scene, report.transcript);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onPointerLeave={() => {
            if (hoverRef.current) hoverRef.current.style.opacity = "0";
            if (readoutRef.current) readoutRef.current.textContent = "";
          }}
          onClick={(e) => {
            if (lastPointer.current === "touch") onSeek(timeAt(e.clientX));
          }}
        >
          <div ref={contentRef} className="st-tl-content" style={{ width: contentW, height: tracksHeight }}>
            <div className="st-tl-sticky" style={{ width: viewW }}>
              <div
                ref={sliderRef}
                data-ruler
                className="st-tl-ruler"
                style={{ height: RULER_H }}
                role="slider"
                tabIndex={0}
                aria-label="Playhead"
                aria-valuemin={0}
                aria-valuemax={Math.round(safeDuration * 10) / 10}
                aria-valuenow={0}
                aria-valuetext={formatTimecode(0)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  e.stopPropagation();
                  onSeek(clock.t + (e.key === "ArrowLeft" ? -1 : 1) / EDIT_FPS);
                }}
              >
                <canvas
                  ref={(el) => {
                    canvases.current.ruler = el;
                  }}
                  aria-hidden="true"
                  style={{ width: viewW, height: RULER_H }}
                />
              </div>
              {!hasScene && emptyNote ? (
                <p className="st-tl-empty" style={{ top: RULER_H, height: rows[0].h }}>
                  {emptyNote}
                </p>
              ) : null}
              {rows.map((row, i) => (
                <div
                  key={row.id}
                  className="st-tl-row"
                  data-on={!row.needsScene || hasScene || undefined}
                  data-off={hidden.has(row.id) || undefined}
                  style={{ height: row.h, marginBottom: ROW_GAP, ["--stagger" as string]: revealDone || !row.needsScene ? "0ms" : `${i * 45}ms` }}
                >
                  {row.id === "notes" ? null : (
                    <canvas
                      ref={(el) => {
                        canvases.current[row.id] = el;
                      }}
                      aria-hidden="true"
                      style={{ width: viewW, height: row.h }}
                    />
                  )}
                </div>
              ))}
            </div>

            {rangeIn !== null || rangeOut !== null ? (
              <div
                className="st-tl-range"
                style={{
                  left: (rangeIn ?? 0) * pps,
                  width: Math.max(1, ((rangeOut ?? safeDuration) - (rangeIn ?? 0)) * pps),
                  height: tracksHeight,
                }}
              />
            ) : null}
            {band ? <div className="st-tl-band" style={{ left: band.t_start * pps, width: Math.max(2, (band.t_end - band.t_start) * pps), height: tracksHeight }} /> : null}
            {loop ? <div className="st-tl-loop" style={{ left: loop.start * pps, width: Math.max(2, (loop.end - loop.start) * pps) }} /> : null}

            {!hidden.has("notes") ? (
              <div className="st-tl-notes" style={{ top: notesTop, height: rows[rows.length - 1].h }}>
                {markers.map((marker, i) => (
                  <button
                    key={marker.key}
                    type="button"
                    className={cn("st-marker", marker.kind === "note" && "st-marker-note")}
                    data-kind={marker.momentKind}
                    data-hot={marker.id === hot || marker.id === selected || undefined}
                    style={{ left: markerXs[i] }}
                    aria-label={marker.kind === "moment" ? `Change ${marker.n} at ${formatTimecode(marker.t)}: ${marker.text}` : `Note at ${formatTimecode(marker.t)}: ${marker.text}`}
                    title={marker.kind === "moment" ? `${marker.n}. ${marker.text} (${formatRange(marker.t, extent(moments[marker.n - 1]).t_end)})` : marker.text}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerEnter={() => marker.kind === "moment" && onHot(marker.id)}
                    onPointerLeave={() => marker.kind === "moment" && onHot(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (marker.kind === "moment") onMoment(moments[marker.n - 1]);
                      else onSeek(marker.t);
                    }}
                  >
                    {marker.kind === "moment" ? marker.n : ""}
                  </button>
                ))}
              </div>
            ) : null}

            <div ref={hoverRef} className="st-tl-hover" style={{ height: tracksHeight }} aria-hidden="true">
              <span ref={hoverTimeRef} className="st-tl-hover-time" />
            </div>
            <div ref={playheadRef} className="st-playhead" style={{ height: tracksHeight }} aria-hidden="true">
              <span ref={flagRef} className="st-flag">
                00:00:00
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

export function EyeSwap({ off }: { off: boolean }) {
  return (
    <span className="st-eye-icons" data-off={off || undefined}>
      <Eye size={13} aria-hidden="true" />
      <EyeOff size={13} aria-hidden="true" />
    </span>
  );
}

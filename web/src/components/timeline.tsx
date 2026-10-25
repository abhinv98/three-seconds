"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRange, formatSeconds, formatTimecode } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimelineLane {
  id: string;
  /** Short lane name, set in the label style: "Label", "Brand". */
  name: string;
  /** What the segments are, for screen readers and tooltips: "Paid partnership label". */
  description: string;
  segments: { t_start: number; t_end: number }[];
}

export interface TimelineMarkers {
  name: string;
  description: string;
  items: { t: number; text: string }[];
}

interface TimelineProps {
  duration: number;
  lanes: TimelineLane[];
  markers?: TimelineMarkers;
  /** Playhead position when no video drives it, and the starting position when one does. */
  playhead: number;
  /** When set, the playhead follows this video frame by frame. */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Without onSeek the timeline is a static picture (used on the upload page). */
  onSeek?: (t: number) => void;
  /** One sentence describing what was measured; announced with the slider. */
  summary: string;
  className?: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60];

/** Follows a video's currentTime with requestAnimationFrame while it plays. */
function useVideoTime(videoRef: RefObject<HTMLVideoElement | null> | undefined) {
  const [time, setTime] = useState<number | null>(null);
  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;
    let frame = 0;
    const read = () => setTime(video.currentTime);
    const loop = () => {
      read();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      read();
    };
    const events: [string, () => void][] = [
      ["play", start],
      ["playing", start],
      ["pause", stop],
      ["ended", stop],
      ["seeked", read],
      ["timeupdate", read],
    ];
    events.forEach(([name, fn]) => video.addEventListener(name, fn));
    if (!video.paused) start();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(([name, fn]) => video.removeEventListener(name, fn));
    };
  }, [videoRef]);
  return [time, setTime] as const;
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function Timeline({ duration, lanes, markers, playhead, videoRef, onSeek, summary, className }: TimelineProps) {
  const summaryId = useId();
  const areaRef = useRef<HTMLDivElement>(null);
  const width = useWidth(areaRef);
  const [videoTime, setVideoTime] = useVideoTime(videoRef);
  const interactive = Boolean(onSeek);
  const safeDuration = duration > 0 ? duration : 1;
  const now = clamp(videoTime ?? playhead, 0, safeDuration);

  const pct = (t: number) => `${(clamp(t, 0, safeDuration) / safeDuration) * 100}%`;

  // Labelled ticks ~92px apart (the first label is left-aligned, so it needs the most room);
  // unlabelled second ticks underneath.
  const maxTicks = Math.max(2, Math.floor((width || 280) / 92));
  const step = TICK_STEPS.find((s) => safeDuration / s <= maxTicks) ?? 60;
  const majors: number[] = [];
  for (let t = 0; t < safeDuration - step * 0.35; t += step) majors.push(t);
  const minorStep = safeDuration <= 30 ? 1 : safeDuration <= 60 ? 2 : 5;

  const seek = (t: number) => {
    const next = clamp(t, 0, safeDuration);
    setVideoTime(next);
    onSeek?.(next);
  };

  const timeAt = (clientX: number) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * safeDuration;
  };

  const scrubHandlers = interactive
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(timeAt(e.clientX));
        },
        onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(timeAt(e.clientX));
        },
      }
    : {};

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 1 : 0.1;
    const moves: Record<string, number> = {
      ArrowLeft: now - step,
      ArrowDown: now - step,
      ArrowRight: now + step,
      ArrowUp: now + step,
      PageDown: now - 5,
      PageUp: now + 5,
      Home: 0,
      End: safeDuration,
    };
    if (e.key in moves) {
      e.preventDefault();
      seek(Math.round(moves[e.key] * 10) / 10);
    }
  };

  const playheadLine = (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -inset-y-[3px] z-10 w-0.5 -translate-x-1/2 bg-timeline-playhead"
      style={{ left: pct(now) }}
    />
  );

  return (
    <div className={cn("select-none", className)}>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <div className="flex gap-3">
        {/* Lane names */}
        <div className="flex w-16 shrink-0 flex-col gap-1.5" aria-hidden="true">
          <div className="h-11" />
          {lanes.map((lane) => (
            <div key={lane.id} className="ts-label flex h-7 items-center text-muted-foreground">
              {lane.name}
            </div>
          ))}
          {markers && <div className="ts-label flex h-7 items-center text-muted-foreground">{markers.name}</div>}
        </div>

        {/* Ruler and lanes share one x-range */}
        <div ref={areaRef} className="relative flex min-w-0 flex-1 touch-pan-y flex-col gap-1.5" {...scrubHandlers}>
          <div
            role={interactive ? "slider" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? "Playhead" : undefined}
            aria-valuemin={interactive ? 0 : undefined}
            aria-valuemax={interactive ? Math.round(safeDuration * 10) / 10 : undefined}
            aria-valuenow={interactive ? Math.round(now * 10) / 10 : undefined}
            aria-valuetext={interactive ? `${formatTimecode(now)} of ${formatTimecode(safeDuration)}` : undefined}
            aria-describedby={interactive ? summaryId : undefined}
            onKeyDown={interactive ? onKeyDown : undefined}
            className={cn("relative h-11 rounded-xs", interactive && "cursor-ew-resize")}
          >
            {/* second ticks */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1.5"
              style={{
                backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                backgroundSize: `calc(100% / ${safeDuration / minorStep}) 100%`,
                backgroundRepeat: "repeat-x",
              }}
            />
            {majors.map((t) => (
              <div key={t} aria-hidden="true" className="absolute inset-y-0" style={{ left: pct(t) }}>
                <span className="absolute bottom-0 h-2.5 w-px bg-input" />
                <span
                  className={cn(
                    "ts-timecode absolute top-[22px] whitespace-nowrap text-muted-foreground",
                    t === 0 ? "left-0" : "-translate-x-1/2",
                  )}
                >
                  {formatTimecode(t)}
                </span>
              </div>
            ))}
            {/* playhead flag, kept inside the ruler at both ends */}
            <span
              aria-hidden="true"
              className="ts-timecode absolute top-0 z-20 w-16 rounded-sm bg-brand py-0.5 text-center text-brand-foreground"
              style={{ left: `clamp(0%, calc(${pct(now)} - 2rem), calc(100% - 4rem))` }}
            >
              {formatTimecode(now)}
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-5 -bottom-[3px] z-10 w-0.5 -translate-x-1/2 bg-timeline-playhead"
              style={{ left: pct(now) }}
            />
          </div>

          {lanes.map((lane) => (
            <div key={lane.id} className="relative h-7 rounded-xs bg-timeline-track">
              {lane.segments.map((segment, i) => {
                const style = { left: pct(segment.t_start), width: pct(segment.t_end - segment.t_start) };
                const range = formatRange(segment.t_start, segment.t_end);
                const held = formatSeconds(segment.t_end - segment.t_start);
                if (!interactive) {
                  return (
                    <span key={i} className="absolute inset-y-1 min-w-1.5 rounded-xs bg-timeline-hold" style={style} />
                  );
                }
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${lane.description} on screen ${range}, ${held}. Play from ${formatTimecode(segment.t_start)}.`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => seek(segment.t_start)}
                        className="absolute inset-y-1 min-w-1.5 rounded-xs bg-timeline-hold transition-opacity duration-[120ms] hover:opacity-80 after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']"
                        style={style}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <span>{lane.description}</span>
                      <span className="ts-timecode text-muted-foreground">
                        {range} · {held}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {playheadLine}
            </div>
          ))}

          {markers && (
            <div className="relative h-7 rounded-xs bg-timeline-track">
              {markers.items.map((marker, i) =>
                interactive ? (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${markers.description} at ${formatTimecode(marker.t)}: ${marker.text}. Play from here.`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => seek(marker.t)}
                        className="absolute inset-y-0 flex w-7 -translate-x-1/2 items-center justify-center"
                        style={{ left: pct(marker.t) }}
                      >
                        <span className="block size-2.5 rotate-45 rounded-[1px] bg-timeline-hold" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      <span className="ts-timecode text-muted-foreground">{formatTimecode(marker.t)}</span>
                      <span>{marker.text}</span>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span
                    key={i}
                    className="absolute top-1/2 block size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-timeline-hold"
                    style={{ left: pct(marker.t) }}
                  />
                ),
              )}
              {playheadLine}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

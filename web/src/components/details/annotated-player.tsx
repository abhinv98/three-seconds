"use client";

import { type RefObject, useEffect, useState } from "react";
import { type Box, boxAt, type FinerDetails, inSpan, type Moment } from "@/lib/details";
import { cn } from "@/lib/utils";

export type PlayerMode = "posted" | "fixed";

interface PlayerProps {
  details: FinerDetails;
  videoRef: RefObject<HTMLVideoElement | null>;
  mode: PlayerMode;
  onMode: (mode: PlayerMode) => void;
  selected: string;
  /** The brand's typeface for the fixes, as a CSS font-family value. */
  brandFont: string;
}

/** currentTime every frame while playing, so outlines follow the picture; at rest, on every seek. */
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
    if (!video.paused) play();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(([name, fn]) => video.removeEventListener(name, fn));
    };
  }, [videoRef]);
  return time;
}

const place = ([x, y, w, h]: Box) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

export function AnnotatedPlayer({ details, videoRef, mode, onMode, selected, brandFont }: PlayerProps) {
  const time = useFrameTime(videoRef);
  const { reel, moments, brand } = details;
  const accent = brand.colors[0].hex;
  const ink = brand.colors[brand.colors.length - 1].hex;

  // Outlines on screen now: every moment with a span here, the selected one on top.
  const outlined = moments
    .map((m, i) => ({ m, n: i + 1, span: m.spans.find((s) => inSpan(s, time)) }))
    .filter((o): o is { m: Moment; n: number; span: NonNullable<typeof o.span> } => o.span !== undefined)
    .sort((a, b) => Number(a.m.id === selected) - Number(b.m.id === selected));
  const fixes = moments.flatMap((m) => (m.fix && m.fix.spans.some((s) => inSpan(s, time)) ? [{ id: m.id, fix: m.fix }] : []));

  return (
    // Two containers: the root sizes the video box (100cqw is the column), the box sizes the fixes' type.
    <div className="@container grid gap-3">
      <div role="group" aria-label="What the Reel shows" className="grid grid-cols-2 rounded-[8px] bg-muted p-1">
        {(
          [
            ["posted", "As posted"],
            ["fixed", "With fixes"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onMode(value)}
            className={cn(
              "h-8 rounded-[6px] text-[13px] font-semibold text-muted-foreground transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
              mode === value && "bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="@container relative mx-auto overflow-hidden rounded-[10px] bg-viewer-plate"
        style={{
          aspectRatio: `${reel.width} / ${reel.height}`,
          height: `min(600px, calc(100dvh - 300px), calc(100cqw * ${reel.height} / ${reel.width}))`,
        }}
      >
        <video
          ref={videoRef}
          controls
          playsInline
          preload="metadata"
          poster={reel.poster}
          className="absolute inset-0 h-full w-full object-cover"
          aria-label={`Video: ${reel.filename}`}
        >
          {reel.video.map((v) => (
            <source key={v.src} src={v.src} type={v.type} />
          ))}
        </video>

        {/* Decorative: the list beside the player carries everything these marks say. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {mode === "posted"
            ? outlined.map(({ m, n, span }) => {
                const active = m.id === selected;
                const box = boxAt(span, time);
                return (
                  <div
                    key={`${m.id}-${span.t_start}`}
                    className={cn(
                      "absolute rounded-[6px] border-brand transition-opacity duration-150 ease-out starting:opacity-0",
                      active ? "border-[2.5px]" : "border-[1.5px] border-dashed opacity-80",
                    )}
                    style={place(box)}
                  >
                    <span
                      className={cn(
                        "absolute left-1/2 max-w-[calc(100%+40px)] -translate-x-1/2 truncate px-1.5 py-0.5 text-[11px] leading-4 font-bold whitespace-nowrap",
                        // A box at the top edge gets its tag underneath, inside the picture.
                        box[1] < 0.06 ? "top-full rounded-b-[5px]" : "-top-px -translate-y-full rounded-t-[5px]",
                        active ? "bg-brand text-brand-foreground" : "bg-black/70 text-white",
                      )}
                    >
                      {active ? `${n}. ${m.title}` : n}
                    </span>
                  </div>
                );
              })
            : fixes.map(({ id, fix }) => (
                <div
                  key={id}
                  className="absolute flex items-center justify-center transition-[opacity,transform] duration-200 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
                  style={place(fix.box)}
                >
                  <span
                    className={cn(
                      "inline-flex h-full max-w-full items-center truncate px-[0.9em] font-semibold whitespace-nowrap",
                      fix.style === "label" ? "justify-start rounded-[0.5em]" : "rounded-full",
                    )}
                    style={{
                      fontFamily: brandFont,
                      fontSize: "clamp(9px, 3.1cqw, 15px)",
                      background: fix.style === "pill" ? accent : ink,
                      color: fix.style === "pill" ? ink : fix.style === "label" ? "#ffffff" : accent,
                    }}
                  >
                    {fix.text}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Film } from "lucide-react";
import { useRef, useState } from "react";
import { POSTER_TILES } from "@/lib/poster";
import { cn } from "@/lib/utils";

/**
 * A Reel's 9:16 thumbnail. The poster is a filmstrip (lib/poster.ts): the first tile shows, and with scrub the pointer's
 * position picks the tile. A Reel from before posters shows a frame of its video instead.
 */
export function ReelThumb({ reelId, hasPoster, scrub = false, className }: { reelId: string; hasPoster: boolean; scrub?: boolean; className?: string }) {
  const [source, setSource] = useState<"poster" | "video" | "none">(hasPoster ? "poster" : "video");
  const strip = useRef<HTMLImageElement>(null);
  const marker = useRef<HTMLSpanElement>(null);

  const tile = (i: number) => {
    if (strip.current) strip.current.style.transform = `translateX(${(-i * 100) / POSTER_TILES}%)`;
    if (marker.current) {
      marker.current.style.transform = `translateX(${i * 100}%)`;
      marker.current.style.opacity = i ? "1" : "0";
    }
  };

  return (
    <div
      className={cn("relative aspect-[9/16] overflow-hidden bg-viewer-plate", className)}
      onPointerMove={
        scrub
          ? (event) => {
              if (event.pointerType !== "mouse") return;
              const box = event.currentTarget.getBoundingClientRect();
              tile(Math.max(0, Math.min(POSTER_TILES - 1, Math.floor(((event.clientX - box.left) / box.width) * POSTER_TILES))));
            }
          : undefined
      }
      onPointerLeave={scrub ? () => tile(0) : undefined}
    >
      {source === "poster" ? (
        // A filmstrip moved by transform inside its clip, which next/image can't do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={strip}
          src={`/api/reels/${reelId}/poster`}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setSource("video")}
          style={{ width: `${POSTER_TILES * 100}%` }}
          className="absolute inset-y-0 left-0 h-full max-w-none"
        />
      ) : source === "video" ? (
        <video src={`/api/reels/${reelId}/video#t=1`} preload="metadata" muted playsInline onError={() => setSource("none")} className="size-full object-cover" aria-hidden="true" />
      ) : (
        <span className="grid size-full place-items-center text-viewer-plate-foreground/60">
          <Film size={18} aria-hidden="true" />
        </span>
      )}
      {scrub && source === "poster" ? (
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px]">
          <span ref={marker} className="block h-full bg-brand opacity-0" style={{ width: `${100 / POSTER_TILES}%` }} />
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { Fragment } from "react";
import { Icon } from "@/components/icon";
import { formatRange, formatTimecode, parseTimecode, TIMECODE_IN_TEXT } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimecodeChipProps {
  t: number;
  end?: number;
  /** What happens at this time; becomes part of the accessible name. */
  label?: string;
  onSeek: (t: number) => void;
  active?: boolean;
  inline?: boolean;
  className?: string;
}

/** Clickable mm:ss.t. Seeks the video; marked active while the playhead is inside its range. */
export function TimecodeChip({ t, end, label, onSeek, active, inline, className }: TimecodeChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSeek(t)}
      aria-label={`Play from ${formatTimecode(t)}${label ? `: ${label}` : ""}`}
      data-active={active || undefined}
      className={cn(
        "ts-timecode relative inline-flex shrink-0 items-center gap-1 rounded-sm border-[1.5px] border-input text-foreground transition-colors duration-[120ms] ease-out hover:bg-accent",
        "data-active:border-brand data-active:bg-brand-surface",
        "after:absolute after:-inset-1.5 after:content-['']",
        inline ? "mx-0.5 h-[22px] px-1 align-[1px]" : "h-8 px-2 sm:h-7",
        className,
      )}
    >
      {!inline && <Icon name="play" size={12} />}
      {end !== undefined && end > t ? formatRange(t, end) : formatTimecode(t)}
    </button>
  );
}

/** Prose with every mm:ss.t turned into a TimecodeChip. */
export function TimecodeText({ text, onSeek }: { text: string; onSeek?: (t: number) => void }) {
  if (!onSeek) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TIMECODE_IN_TEXT)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(<Fragment key={`t${last}`}>{text.slice(last, index)}</Fragment>);
    parts.push(<TimecodeChip key={`c${index}`} t={parseTimecode(match[1], match[2])} onSeek={onSeek} inline />);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(<Fragment key={`t${last}`}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

"use client";

import { useState } from "react";
import { Panel } from "@/components/account/bits";
import { fieldClass } from "@/components/ui/input";
import { formatHold } from "@/lib/asci";
import { cn } from "@/lib/utils";
import { holdFor, holdFrames } from "./label";

const LONGEST = 180;

export function HoldCalculator() {
  const [text, setText] = useState("30");
  const length = Number(text);
  const valid = text.trim() !== "" && Number.isFinite(length) && length > 0;
  const hold = valid ? holdFor(length) : null;

  return (
    <Panel title="Hold calculator">
      <div className="grid gap-5 p-5">
        <div className="grid gap-2">
          <label htmlFor="reel-length" className="text-sm font-semibold">
            Reel length in seconds
          </label>
          <div className="flex items-center gap-3">
            <input
              id="reel-length"
              type="number"
              inputMode="decimal"
              min={1}
              step="any"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className={cn(fieldClass, "w-24 shrink-0 font-mono")}
            />
            <input
              type="range"
              aria-label="Reel length"
              min={1}
              max={LONGEST}
              value={valid ? Math.min(length, LONGEST) : 1}
              onChange={(event) => setText(event.target.value)}
              className="min-w-0 flex-1 accent-brand"
            />
          </div>
        </div>

        {hold ? (
          <div className="grid gap-3" aria-live="polite">
            <div>
              <p className="text-[13px] text-muted-foreground">The label has to stay on screen for</p>
              {hold.seconds !== null ? (
                <p className="font-mono text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums">{formatHold(hold.seconds)}</p>
              ) : (
                <p className="text-[26px] leading-tight font-bold tracking-[-0.02em]">The whole section where the brand comes up</p>
              )}
            </div>
            {hold.seconds !== null ? (
              <>
                <div className="h-3 overflow-hidden rounded-sm bg-timeline-track" aria-hidden="true">
                  <div
                    className="h-full origin-left bg-brand transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={{ transform: `scaleX(${Math.min(1, hold.seconds / length)})` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {holdFrames(hold.seconds)} frames at 30 fps, in one stretch. Start it on the first frame.
                </p>
              </>
            ) : null}
            <p className="text-[13px] text-pretty text-muted-foreground">
              <span className="font-mono text-foreground">{hold.clause.code.replace("ASCI-IG ", "")}</span> &ldquo;{hold.clause.text}&rdquo;{" "}
              {hold.clause.source_url ? (
                <a href={hold.clause.source_url} target="_blank" rel="noreferrer" className="rounded-xs text-brand-text underline underline-offset-2">
                  Source
                </a>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Enter the Reel&rsquo;s length to see the hold.</p>
        )}
      </div>
    </Panel>
  );
}

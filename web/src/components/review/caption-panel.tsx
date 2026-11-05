"use client";

import { Check, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { saveCaptionAction } from "@/app/dashboard/review-actions";
import { Panel, when } from "@/components/account/bits";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { checkCaption, combinedOutcome, type CaptionCheck } from "@/lib/caption";
import { verdictStatus, type Verdict } from "@/lib/report";
import type { ReelCaption } from "@/lib/review";
import { cn } from "@/lib/utils";

const CAPTION_LIMIT = 2200;

interface CaptionPanelProps {
  reelId: string;
  caption: Pick<ReelCaption, "caption" | "usesPlatformTag"> & Partial<Pick<ReelCaption, "by_name" | "at">> | null;
  /** The verdict measured from the file. This panel adds to it and never replaces it. */
  measured: Verdict | null;
  /** The public sample: the check runs on what's pasted, and nothing is saved. */
  readOnly?: boolean;
  /** The public share page: the saved caption and its result, nothing to change. */
  view?: boolean;
  className?: string;
}

export function CaptionPanel({ reelId, caption, measured, readOnly = false, view = false, className }: CaptionPanelProps) {
  const savedText = caption?.caption ?? "";
  const savedTag = caption?.usesPlatformTag ?? false;
  const [text, setText] = useState(savedText);
  const [tag, setTag] = useState(savedTag);
  const [pending, start] = useTransition();
  const check = useMemo(() => checkCaption(text, tag), [text, tag]);
  const entered = Boolean(text.trim()) || tag;
  const changed = text !== savedText || tag !== savedTag;

  function save() {
    start(async () => {
      const result = await saveCaptionAction(reelId, text, tag);
      if ("error" in result) toast(result.error, { tone: "fail" });
      else toast("Caption saved.", { tone: "ok" });
    });
  }

  return (
    <Panel title="Caption and tag" className={className}>
      <div className="grid gap-4 p-5">
        <p className="max-w-[68ch] text-sm text-pretty text-muted-foreground">
          Instagram&rsquo;s Paid partnership tag is added when you post, so it isn&rsquo;t in the file we checked. That&rsquo;s why a file with no burned-in label can fail the on-screen check and still be fine with the tag on.
        </p>

        {view ? (
          <div className="grid gap-1.5">
            {text ? <p className="rounded-[6px] bg-muted px-3 py-2 text-sm whitespace-pre-line">{text}</p> : null}
            <p className="text-sm font-semibold">{tag ? "Posts with Instagram's Paid partnership tag." : "Posts without Instagram's Paid partnership tag."}</p>
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">The post&rsquo;s caption</span>
              <textarea
                value={text}
                maxLength={CAPTION_LIMIT}
                rows={3}
                placeholder="Paste it here, the way it will go up"
                onChange={(event) => setText(event.target.value)}
                className={cn(fieldClass, "h-auto resize-y py-2 leading-snug")}
              />
            </label>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input type="checkbox" role="switch" checked={tag} onChange={(event) => setTag(event.target.checked)} className="peer sr-only" />
              <span
                aria-hidden="true"
                className="relative h-5 w-9 shrink-0 rounded-full border border-foreground bg-muted transition-colors duration-150 peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-checked:[&>span]:translate-x-4"
              >
                <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full border border-foreground bg-card transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]" />
              </span>
              Will post with Instagram&rsquo;s Paid partnership tag
            </label>
          </div>
        )}

        <div className="grid gap-3 rounded-[6px] border border-border p-4" aria-live="polite">
          <dl className="grid gap-2">
            {measured ? <Outcome label="On screen, measured from the file" verdict={measured} /> : null}
            {entered ? (
              <Outcome label={view ? "Caption and tag, as entered" : "Caption and tag, from what's entered here"} verdict={check.verdict} />
            ) : (
              <p className="text-sm text-muted-foreground">Paste the caption or turn on the tag to check the post as well as the file.</p>
            )}
          </dl>
          {measured && entered ? <p className="text-[15px] font-semibold text-pretty">{combinedOutcome(measured, check.verdict, tag)}</p> : null}
          {entered ? <Lines lines={check.lines} /> : null}
        </div>

        {view ? null : readOnly ? (
          <p className="text-[13px] text-muted-foreground">This sample doesn&rsquo;t save. The check still runs on what you paste.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="compact" variant="secondary" disabled={pending || !changed} onClick={save}>
              {pending ? "Saving" : "Save caption"}
            </Button>
            {caption?.by_name && caption.at && !changed ? (
              <span className="text-[13px] text-muted-foreground">
                Saved by {caption.by_name}, {when(caption.at)}
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Outcome({ label, verdict }: { label: string; verdict: Verdict }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        <StatusBadge status={verdictStatus(verdict)} />
      </dd>
    </div>
  );
}

/** A line ends with the clause it rests on, quoted; that part is set small. */
function Lines({ lines }: { lines: CaptionCheck["lines"] }) {
  return (
    <ul className="grid gap-2 border-t border-border pt-3">
      {lines.map((line) => {
        const [, say, clause] = line.text.match(/^(.*?)\s*(\d\.\d[a-z]?: ".*")$/s) ?? [null, line.text, null];
        return (
          <li key={line.text} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-sm">
            {line.ok ? <Check size={16} aria-label="Good" className="mt-0.5 text-pass-text" /> : <X size={16} aria-label="Missing" className="mt-0.5 text-fail-text" />}
            <div className="min-w-0 text-pretty">
              {say ? <p>{say}</p> : null}
              {clause ? <p className="mt-0.5 text-[13px] text-muted-foreground">{clause}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

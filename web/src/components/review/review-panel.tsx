"use client";

import { Check, CornerDownLeft, PencilLine } from "lucide-react";
import { useState, useTransition } from "react";
import { reviewReelAction } from "@/app/dashboard/review-actions";
import { Panel, when } from "@/components/account/bits";
import { ShareLink } from "@/components/review/share-link";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { ReelReview, ReviewStatus } from "@/lib/review";
import { cn } from "@/lib/utils";

const NOTE_LIMIT = 1000;

const BADGE: Record<ReviewStatus, { word: string; className: string; icon: typeof Check }> = {
  approved: { word: "Approved", className: "bg-pass-surface text-pass-text", icon: Check },
  changes: { word: "Changes requested", className: "bg-brand-surface text-brand-text", icon: PencilLine },
};

/** The brand's answer as a chip, for lists and headers. Nothing yet reads as not reviewed. */
export function ReviewBadge({ status, className }: { status: ReviewStatus | null | undefined; className?: string }) {
  const badge = status ? BADGE[status] : null;
  const Icon = badge?.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-sm px-2 text-xs leading-4 font-bold whitespace-nowrap",
        badge?.className ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      {badge?.word ?? "Not reviewed"}
    </span>
  );
}

interface ReviewPanelProps {
  reelId: string;
  review: ReelReview | null;
  /** A creator, or the public sample: the status and the note show, with no buttons. */
  readOnly?: boolean;
}

export function ReviewPanel({ reelId, review, readOnly = false }: ReviewPanelProps) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function answer(status: ReviewStatus, text: string) {
    start(async () => {
      const result = await reviewReelAction(reelId, status, text);
      if ("error" in result) {
        toast(result.error, { tone: "fail" });
        return;
      }
      toast(status === "approved" ? "Approved. The creator sees it on their Reel." : "Changes requested. The creator sees your note.", { tone: "ok" });
      setAsking(false);
      setNote("");
    });
  }

  return (
    <Panel title="Review" action={<ReviewBadge status={review?.status} />}>
      <div className="grid gap-3 px-5 py-4">
        {review ? (
          <div className="grid gap-1">
            {review.note ? <p className="text-[15px] text-pretty whitespace-pre-line">{review.note}</p> : null}
            <p className="text-[13px] text-muted-foreground">
              {BADGE[review.status].word} by {review.by_name}, {when(review.at)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{readOnly ? "The brand hasn't answered yet." : "Approve this Reel, or say what should change. The creator sees your answer."}</p>
        )}

        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="compact" disabled={pending} onClick={() => answer("approved", "")}>
              <Check size={15} aria-hidden="true" />
              Approve
            </Button>
            <Button size="compact" variant="secondary" disabled={pending} aria-expanded={asking} onClick={() => setAsking((open) => !open)}>
              <PencilLine size={15} aria-hidden="true" />
              Request changes
            </Button>
          </div>
        )}

        {!readOnly && asking ? (
          <form
            className="grid gap-2 transition-opacity duration-150 ease-out starting:opacity-0"
            onSubmit={(event) => {
              event.preventDefault();
              answer("changes", note);
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold">What should change</span>
              <textarea
                autoFocus
                required
                value={note}
                maxLength={NOTE_LIMIT}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
                className={cn(fieldClass, "h-auto resize-y py-2 leading-snug")}
              />
            </label>
            <Button type="submit" size="compact" variant="secondary" disabled={pending || !note.trim()} className="justify-self-start">
              <CornerDownLeft size={15} aria-hidden="true" />
              Send to the creator
            </Button>
          </form>
        ) : null}

        {readOnly ? null : <ShareLink reelId={reelId} />}
      </div>
    </Panel>
  );
}

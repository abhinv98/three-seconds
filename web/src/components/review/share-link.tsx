"use client";

import { Link2, Link2Off } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createShareLinkAction, currentShareLinkAction, revokeShareLinkAction } from "@/app/dashboard/review-actions";
import { CopyLink } from "@/components/account/copy-link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** A public, read-only page for this one Reel, for someone with no account. Turning it off works at once. */
export function ShareLink({ reelId }: { reelId: string }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    currentShareLinkAction(reelId).then(
      (answer) => {
        if (live) setUrl(answer.url);
      },
      () => {
        if (live) setUrl(null);
      },
    );
    return () => {
      live = false;
    };
  }, [reelId]);

  function make() {
    start(async () => {
      const answer = await createShareLinkAction(reelId);
      if ("error" in answer) toast(answer.error, { tone: "fail" });
      else {
        setUrl(answer.url);
        toast("Share link made. Anyone with it can see this Reel.", { tone: "ok" });
      }
    });
  }

  function turnOff() {
    start(async () => {
      const answer = await revokeShareLinkAction(reelId);
      if ("error" in answer) toast(answer.error, { tone: "fail" });
      else {
        setUrl(null);
        toast("Share link turned off. It stopped working just now.", { tone: "ok" });
      }
    });
  }

  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <p className="text-sm font-semibold">Share with a creator who has no account</p>
      {url === undefined ? (
        <div className="h-9" aria-hidden="true" />
      ) : url ? (
        <>
          <CopyLink url={url} label="Share link" />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="text-[13px] text-muted-foreground">Read-only: the Reel, the fixes, the notes and your answer. No names or emails.</p>
            <Button size="compact-sm" variant="ghost" disabled={pending} onClick={turnOff}>
              <Link2Off size={14} aria-hidden="true" />
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button size="compact" variant="secondary" disabled={pending} onClick={make}>
            <Link2 size={15} aria-hidden="true" />
            Make a share link
          </Button>
          <p className="min-w-0 flex-1 basis-[220px] text-[13px] text-muted-foreground">Read-only: the Reel, the fixes, the notes and your answer. No names or emails.</p>
        </div>
      )}
    </div>
  );
}

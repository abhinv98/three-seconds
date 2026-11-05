"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * An invite link and a copy button. The clipboard only works on https or localhost, so over a LAN or Tailscale
 * address the button selects the link instead, ready for Ctrl+C.
 */
export function CopyLink({ url, label = "Invite link" }: { url: string; label?: string }) {
  const field = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "selected">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      toast("Link copied", { tone: "ok" });
    } catch {
      field.current?.select();
      setState("selected");
    }
    window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <div className="flex min-w-0 gap-2">
      <input
        ref={field}
        readOnly
        value={url}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className={cn(fieldClass, "font-mono text-[13px]")}
      />
      <Button type="button" variant="outline" size="compact" onClick={copy} className="shrink-0">
        {state === "copied" ? "Copied" : state === "selected" ? "Press Ctrl+C" : "Copy"}
      </Button>
    </div>
  );
}

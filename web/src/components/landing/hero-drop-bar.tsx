"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/limits";
import { setPendingUpload } from "@/lib/pending-upload";
import { cn } from "@/lib/utils";

/**
 * The hero's prompt-style drop bar. A dropped or chosen file is handed to /check, which runs the
 * same upload flow; validation and errors live there, in one place.
 */
export function HeroDropBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const inputId = useId();

  const take = (file: File | undefined) => {
    if (!file) return;
    setPendingUpload(file);
    router.push("/check");
  };

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        take(e.dataTransfer.files?.[0]);
      }}
      data-dragging={dragging || undefined}
      className={cn(
        "group relative flex flex-col gap-2 rounded-[20px] bg-card p-2 transition-[box-shadow,background-color] duration-200 sm:flex-row sm:items-center",
        "shadow-[0_0_0_1px_var(--border),0_0_0_6px_color-mix(in_oklab,var(--card)_70%,transparent),0_24px_60px_-30px_rgb(18_18_18/0.35)]",
        "data-dragging:bg-brand-surface data-dragging:shadow-[0_0_0_2px_var(--brand),0_0_0_8px_color-mix(in_oklab,var(--brand-surface)_80%,transparent)]",
        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
      )}
    >
      <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[14px] px-2 py-2 sm:py-1">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-background text-foreground">
          <Icon name={dragging ? "film" : "upload"} size={20} />
        </span>
        <span className="min-w-0">
          <span className="ts-body block font-semibold">
            {dragging ? "Drop to check this video" : "Drop a Reel or Short"}
            <span className="font-normal text-muted-foreground"> or choose a file</span>
          </span>
          <span className="block font-mono text-[12px] leading-4 text-muted-foreground">MP4 · MOV · up to 90s · 100 MB</span>
        </span>
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Choose a Reel or Short to check"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          take(file);
        }}
      />
      <Button variant="brand" size="lg" className="btn-sheen w-full sm:w-auto" onClick={() => inputRef.current?.click()}>
        Check an ad
        <Icon name="arrow-right" size={18} />
      </Button>
    </div>
  );
}

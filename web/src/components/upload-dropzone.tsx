"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { buttonVariants } from "@/components/ui/button";
import { ACCEPT_ATTRIBUTE } from "@/lib/limits";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  /** Reading the file's metadata; the zone is locked. */
  busy?: boolean;
  error?: string;
}

/** Drag and drop or click to choose. The whole zone is the file input's label. */
export function UploadDropzone({ onFile, busy, error }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const take = (file: File | undefined) => {
    if (file && !busy) onFile(file);
  };

  return (
    <div>
      <label
        htmlFor={inputId}
        data-dragging={dragging || undefined}
        aria-busy={busy || undefined}
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
        className={cn(
          "group relative flex min-h-60 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-[1.5px] border-dashed border-input bg-card px-6 py-10 text-center transition-colors duration-[120ms] ease-out sm:min-h-64 sm:px-10",
          "hover:border-foreground data-dragging:border-solid data-dragging:border-brand data-dragging:bg-brand-surface",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
          busy && "cursor-progress",
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={busy}
          aria-label="Choose a video to check"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            take(file);
          }}
        />
        <span className="flex size-12 items-center justify-center rounded-md bg-background text-foreground">
          <Icon name={busy ? "spinner" : "upload"} size={22} />
        </span>
        <span className="ts-title">
          {busy ? "Reading video…" : dragging ? "Drop to check this video" : "Drop a Reel or Short here"}
        </span>
        <span aria-hidden="true" className={cn(buttonVariants({ variant: "primary" }), "pointer-events-none", busy && "opacity-50")}>
          Choose video
        </span>
        <span id={hintId} className="ts-caption text-muted-foreground">
          MP4 or MOV · up to 90s · up to 100 MB
        </span>
      </label>
      {error && (
        <p id={errorId} role="alert" className="ts-body-sm mt-3 flex items-start gap-2 text-fail-text">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

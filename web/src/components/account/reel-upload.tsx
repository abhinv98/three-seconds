"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Tick } from "@/components/landing/tick";
import { UploadDropzone } from "@/components/upload-dropzone";
import { blobPathname, checkFile } from "@/components/upload-flow";
import { Progress } from "@/components/ui/progress";
import { contentTypeFor } from "@/lib/limits";

type Phase = { kind: "idle"; error?: string } | { kind: "uploading"; name: string; share: number } | { kind: "checking"; name: string };

/** Upload a Reel straight to Vercel Blob (a function can't take a body over 4.5 MB), then have /api/reels check it. */
export function ReelUpload({ folder }: { folder: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  async function start(file: File) {
    const problem = checkFile(file);
    if (problem) return setPhase({ kind: "idle", error: problem });
    setPhase({ kind: "uploading", name: file.name, share: 0 });
    let url: string;
    try {
      const blob = await upload(blobPathname(file.name), file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: contentTypeFor(file) ?? undefined,
        multipart: file.size > 20 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setPhase({ kind: "uploading", name: file.name, share: percentage / 100 }),
      });
      url = blob.url;
    } catch (error) {
      return setPhase({ kind: "idle", error: (error as Error).message || "The upload stopped. Check your connection and try again." });
    }
    setPhase({ kind: "checking", name: file.name });
    const response = await fetch("/api/reels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, filename: file.name }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (response?.ok && body?.id) router.push(`/dashboard/reels/${body.id}`);
    else if (body?.id) router.push(`/dashboard/reels/${body.id}?error=${encodeURIComponent(body.error ?? "The check failed.")}`);
    else setPhase({ kind: "idle", error: body?.error ?? (response ? `The check failed (HTTP ${response.status}).` : "The check stopped. Check your connection and try again.") });
  }

  if (phase.kind === "idle") {
    return (
      <div className="grid gap-3">
        <UploadDropzone onFile={start} error={phase.error} />
        <p className="text-[13px] text-muted-foreground">
          {folder ? `Checks you run here are kept in the ${folder} folder.` : "Every check is kept in My Reels, ready to send to a brand."}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-5 rounded-[10px] border border-border bg-card p-6" aria-live="polite">
      <span className="shrink-0 [&_canvas]:[image-rendering:pixelated]">
        <Tick size={88} mood={phase.kind === "checking" ? "read" : "count"} lcd={phase.kind === "uploading" ? String(Math.round(phase.share * 100)) : undefined} />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="truncate text-[15px] font-bold">{phase.name}</p>
        <p className="text-sm text-muted-foreground">
          {phase.kind === "uploading" ? "Uploading…" : "Mr Tickle is reading every frame and timing the label. This takes under a minute."}
        </p>
        {phase.kind === "uploading" ? <Progress value={phase.share * 100} className="h-1.5" /> : null}
      </div>
    </div>
  );
}

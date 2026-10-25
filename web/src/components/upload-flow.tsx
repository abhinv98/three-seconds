"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AnalysisSteps, type AnalysisStep } from "@/components/analysis-steps";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { UploadDropzone } from "@/components/upload-dropzone";
import { formatBytes, formatSeconds, formatTimecode } from "@/lib/format";
import { contentTypeFor, MAX_BYTES, MAX_DURATION_S } from "@/lib/limits";
import type { Report } from "@/lib/report";
import { saveReport } from "@/lib/report-store";

/** blob: upload to Vercel Blob. local: dev without a token, the video stays in this tab. missing: misconfigured deploy. */
export type StorageMode = "blob" | "local" | "missing";

interface VideoMeta {
  duration: number;
  width: number;
  height: number;
}

type Phase =
  | { kind: "idle"; error?: string }
  | { kind: "reading"; file: File }
  | { kind: "uploading"; file: File; meta: VideoMeta; loaded: number; percentage: number }
  | { kind: "analyzing"; file: File; meta: VideoMeta; blobUrl: string }
  | { kind: "failed"; file: File; meta: VideoMeta; step: "upload" | "analyze"; message: string; blobUrl?: string };

function checkFile(file: File): string | null {
  if (!contentTypeFor(file)) return `“${file.name}” isn't an MP4 or MOV video.`;
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_BYTES) return `This file is ${formatBytes(file.size)}. The limit is 100 MB.`;
  return null;
}

/** Reads duration and size in the browser before anything is uploaded. */
function readVideoMeta(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const cleanup = () => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Reading this video took too long. Try an MP4 (H.264)."));
    }, 15000);
    video.onloadedmetadata = () => {
      const meta = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      cleanup();
      if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
        reject(new Error("We couldn't read how long this video is. Try an MP4 (H.264)."));
      } else {
        resolve(meta);
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Your browser can't read this video. Try an MP4 (H.264)."));
    };
    video.src = url;
  });
}

function blobPathname(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const stem = (dot > 0 ? filename.slice(0, dot) : filename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const extension = dot > 0 ? filename.slice(dot + 1).toLowerCase() : "mp4";
  return `videos/${stem || "video"}.${extension}`;
}

interface UploadFlowProps {
  storage: StorageMode;
  analysis: "mock" | "worker";
}

export function UploadFlow({ storage, analysis }: UploadFlowProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  async function analyze(file: File, meta: VideoMeta, blobUrl: string) {
    setPhase({ kind: "analyzing", file, meta, blobUrl });
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobUrl,
          filename: file.name,
          durationS: meta.duration,
          width: meta.width,
          height: meta.height,
        }),
      });
      const body = (await response.json().catch(() => null)) as (Report & { error?: string }) | null;
      if (!response.ok || !body || typeof body.job_id !== "string") {
        throw new Error(body?.error ?? `The check failed (HTTP ${response.status}).`);
      }
      if (!saveReport(body)) throw new Error("This browser blocked session storage, so the report can't be kept.");
      router.push(`/report/${encodeURIComponent(body.job_id)}`);
    } catch (error) {
      setPhase({ kind: "failed", file, meta, step: "analyze", message: (error as Error).message, blobUrl });
    }
  }

  async function uploadThenAnalyze(file: File, meta: VideoMeta) {
    if (storage === "local") {
      // Dev without a Blob token: nothing leaves the browser; the URL lives as long as this tab.
      await analyze(file, meta, URL.createObjectURL(file));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "uploading", file, meta, loaded: 0, percentage: 0 });
    let blobUrl: string;
    try {
      const blob = await upload(blobPathname(file.name), file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: contentTypeFor(file) ?? undefined,
        multipart: file.size > 20 * 1024 * 1024,
        abortSignal: controller.signal,
        onUploadProgress: ({ loaded, percentage }) =>
          setPhase((p) => (p.kind === "uploading" && p.file === file ? { ...p, loaded, percentage } : p)),
      });
      blobUrl = blob.url;
    } catch (error) {
      if (controller.signal.aborted) {
        setPhase({ kind: "idle" });
        return;
      }
      setPhase({ kind: "failed", file, meta, step: "upload", message: (error as Error).message || "Upload failed." });
      return;
    } finally {
      abortRef.current = null;
    }
    await analyze(file, meta, blobUrl);
  }

  async function start(file: File) {
    const problem = checkFile(file);
    if (problem) return setPhase({ kind: "idle", error: problem });
    if (storage === "missing") {
      return setPhase({
        kind: "idle",
        error: "Upload storage isn't set up for this deployment. Connect a Vercel Blob store to the project.",
      });
    }
    setPhase({ kind: "reading", file });
    let meta: VideoMeta;
    try {
      meta = await readVideoMeta(file);
    } catch (error) {
      return setPhase({ kind: "idle", error: (error as Error).message });
    }
    if (meta.duration > MAX_DURATION_S) {
      return setPhase({
        kind: "idle",
        error: `This video runs ${formatSeconds(meta.duration)}. The limit is ${formatSeconds(MAX_DURATION_S)}.`,
      });
    }
    await uploadThenAnalyze(file, meta);
  }

  if (phase.kind === "idle" || phase.kind === "reading") {
    return (
      <UploadDropzone
        onFile={start}
        busy={phase.kind === "reading"}
        error={phase.kind === "idle" ? phase.error : undefined}
      />
    );
  }

  const { file, meta } = phase;
  const local = storage === "local";
  const steps: AnalysisStep[] = [
    {
      id: "read",
      label: "Read video",
      detail: `${formatTimecode(meta.duration)} · ${meta.width}×${meta.height} · ${formatBytes(file.size)}`,
      status: "done",
    },
    local
      ? {
          id: "upload",
          label: "Keep in this tab",
          detail: "Local preview: Blob storage isn't configured, so nothing is uploaded.",
          status: "done",
        }
      : phase.kind === "uploading"
        ? {
            id: "upload",
            label: "Upload",
            detail: `${Math.round(phase.percentage)}% · ${formatBytes(phase.loaded)} of ${formatBytes(file.size)}`,
            status: "active",
            progress: phase.percentage,
          }
        : phase.kind === "failed" && phase.step === "upload"
          ? { id: "upload", label: "Upload", detail: phase.message, status: "fail" }
          : { id: "upload", label: "Upload", detail: formatBytes(file.size), status: "done" },
    {
      id: "check",
      label: "Check against ASCI guidelines",
      detail:
        phase.kind === "failed" && phase.step === "analyze"
          ? phase.message
          : analysis === "mock"
            ? "Sample report, AI pipeline not connected yet."
            : "Disclosure label, brand and speech.",
      status:
        phase.kind === "analyzing"
          ? "active"
          : phase.kind === "failed" && phase.step === "analyze"
            ? "fail"
            : "pending",
    },
  ];

  const announcement =
    phase.kind === "uploading"
      ? `Uploading, ${Math.floor(phase.percentage / 10) * 10}%`
      : phase.kind === "analyzing"
        ? "Checking the video"
        : `Failed: ${phase.message}`;

  return (
    <div className="rounded-lg bg-card p-4 sm:p-6">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background">
            <Icon name="film" size={20} />
          </span>
          <div className="min-w-0">
            <p className="ts-code truncate text-foreground">{file.name}</p>
            <p className="ts-caption text-muted-foreground">{local ? "Local preview" : "Vercel Blob"}</p>
          </div>
        </div>
        {phase.kind === "uploading" && (
          <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        )}
      </div>
      <AnalysisSteps className="mt-2" steps={steps} />
      {phase.kind === "failed" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              phase.step === "upload" || !phase.blobUrl
                ? uploadThenAnalyze(file, meta)
                : analyze(file, meta, phase.blobUrl)
            }
          >
            <Icon name="refresh" size={18} />
            Try again
          </Button>
          <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
            Choose another video
          </Button>
        </div>
      )}
    </div>
  );
}

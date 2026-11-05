"use client";

import { upload } from "@vercel/blob/client";
import { Check, Loader, TriangleAlert, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { blobPathname, checkFile } from "@/components/upload-flow";
import { formatBytes, formatSeconds, formatTimecode } from "@/lib/format";
import { frameTimes, posterFrames, WALL_FPS, wallGrid, type WallGrid } from "@/lib/frame-wall";
import { ACCEPT_ATTRIBUTE, contentTypeFor, MAX_DURATION_S } from "@/lib/limits";
import { POSTER_TILE_H, POSTER_TILE_W, POSTER_TILES } from "@/lib/poster";
import { cn } from "@/lib/utils";

// The check, as it happens. Frames are pulled from the chosen file right here in the browser, and the wall shows every
// one. The upload shows real bytes. The server's part shows real elapsed time and what's running, with no percentage,
// because the worker doesn't report one. Canvas, not an <img> per frame: one bitmap however long the Reel is.

const GAP = 2;
const GHOST_TILES = 120;
/** At least this long per frame: a fast machine would otherwise finish the wall before anyone sees it being built. */
const MIN_MS_PER_FRAME = 40;
/** How long the check waits for the poster once the upload has finished. A slow decode shouldn't hold up the report. */
const POSTER_WAIT_MS = 8000;

interface Meta {
  duration: number;
  width: number;
  height: number;
}

type Phase =
  | { kind: "idle"; error?: string }
  | { kind: "running"; file: File; attempt: number };

export function ReelUpload({ folder, analysis }: { folder: string | null; analysis: "worker" | "sample" }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const attempts = useRef(0);
  const running = phase.kind === "running";

  function start(file: File | undefined | null) {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) return setPhase({ kind: "idle", error: problem });
    attempts.current += 1;
    setPhase({ kind: "running", file, attempt: attempts.current });
  }

  // A file dropped anywhere on the page counts, and a near miss doesn't navigate the tab away to the file.
  useEffect(() => {
    let depth = 0;
    const over = (event: DragEvent) => event.preventDefault();
    const enter = (event: DragEvent) => {
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      event.preventDefault();
      depth = 0;
      setDragging(false);
      if (!running) start(event.dataTransfer?.files?.[0]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [running]);

  if (phase.kind === "running") {
    return <CheckStage key={phase.attempt} file={phase.file} analysis={analysis} onCancel={(error) => setPhase({ kind: "idle", error })} onRetry={() => start(phase.file)} />;
  }

  return (
    <section aria-label="Choose a Reel" className={cn("check-stage", dragging && "check-stage-over")}>
      <div className="check-body">
        <div className="check-monitor" aria-hidden="true" />
        <GhostWall />
      </div>
      <label className="check-drop">
        <input
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          aria-label="Choose a video to check"
          aria-describedby={phase.error ? "check-error" : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            start(file);
          }}
        />
        <span className="check-drop-card">
          <span className="text-[26px] leading-tight font-bold tracking-[-0.02em] sm:text-[34px]">{dragging ? "Drop it" : "Drop a Reel here"}</span>
          <span className="btn-flat btn-flat-primary pointer-events-none inline-flex h-11 items-center gap-2 rounded-[6px] px-5 text-[15px] font-bold">
            <Upload size={17} aria-hidden="true" />
            Choose a video
          </span>
          <span className="text-[13px] text-[var(--stone-400)]">Up to {MAX_DURATION_S} seconds, MP4 or MOV, up to 100 MB.</span>
          {phase.error ? (
            <span id="check-error" role="alert" className="flex max-w-[44ch] items-start gap-2 text-left text-[14px] font-semibold text-[var(--fail-400)]">
              <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {phase.error}
            </span>
          ) : (
            <span className="text-[13px] text-[var(--stone-400)]">{folder ? `Checks run here are kept in the ${folder} folder.` : "Every check is kept in My Reels, ready to send to a brand."}</span>
          )}
        </span>
      </label>
    </section>
  );
}

function drawSlots(canvas: HTMLCanvasElement, count: number, width: number, height: number, dpr: number): WallGrid {
  const grid = wallGrid(count, width, height, GAP);
  const gridW = grid.cols * grid.tileW + (grid.cols - 1) * GAP;
  const gridH = grid.rows * grid.tileH + (grid.rows - 1) * GAP;
  canvas.width = Math.round(gridW * dpr);
  canvas.height = Math.round(gridH * dpr);
  canvas.style.aspectRatio = `${gridW} / ${gridH}`;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgb(243 241 234 / 0.06)";
    for (let i = 0; i < count; i++) {
      const [x, y] = tileAt(i, grid);
      ctx.fillRect(x * dpr, y * dpr, grid.tileW * dpr, grid.tileH * dpr);
    }
  }
  return grid;
}

const tileAt = (i: number, grid: WallGrid): [number, number] => [(i % grid.cols) * (grid.tileW + GAP), Math.floor(i / grid.cols) * (grid.tileH + GAP)];

/** Paints a video frame into a tile, cropped to fill it. */
function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, x, y, w, h);
}

function GhostWall() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (box.current && canvas.current) drawSlots(canvas.current, GHOST_TILES, box.current.clientWidth, box.current.clientHeight, Math.min(window.devicePixelRatio || 1, 2));
  }, []);
  return (
    <div ref={box} className="check-wall" aria-hidden="true">
      <canvas ref={canvas} className="check-wall-canvas" />
    </div>
  );
}

function once(target: EventTarget, name: string, signal: AbortSignal, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      target.removeEventListener(name, done);
      signal.removeEventListener("abort", done);
      if (signal.aborted) reject(new DOMException("Stopped", "AbortError"));
      else resolve();
    };
    const timer = setTimeout(() => {
      target.removeEventListener(name, done);
      signal.removeEventListener("abort", done);
      reject(new Error(`No ${name} after ${timeoutMs} ms`));
    }, timeoutMs);
    target.addEventListener(name, done, { once: true });
    signal.addEventListener("abort", done, { once: true });
  });
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UploadState = { loaded: number; share: number; done: boolean };
type Failure = { step: "upload" | "check"; message: string };

function CheckStage({ file, analysis, onCancel, onRetry }: { file: File; analysis: "worker" | "sample"; onCancel: (error?: string) => void; onRetry: () => void }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const video = useRef<HTMLVideoElement>(null);
  const wallBox = useRef<HTMLDivElement>(null);
  const wall = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const scan = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const serverClock = useRef<HTMLSpanElement>(null);
  const frameChip = useRef<HTMLSpanElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [frames, setFrames] = useState({ pulled: 0, total: 0, done: false, failed: false });
  const [sent, setSent] = useState<UploadState>({ loaded: 0, share: 0, done: false });
  const [checkStarted, setCheckStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    const el = video.current;
    const canvas = wall.current;
    const box = wallBox.current;
    if (!el || !canvas || !box) return;
    const stopped = new AbortController();
    const signal = stopped.signal;
    const started = performance.now();
    let serverStarted = 0;
    let url = "";
    let grid: WallGrid | null = null;
    let total = 0;

    const clockTimer = window.setInterval(() => {
      const now = performance.now();
      if (clock.current) clock.current.textContent = formatTimecode((now - started) / 1000);
      if (serverStarted && serverClock.current) serverClock.current.textContent = formatTimecode((now - serverStarted) / 1000);
    }, 100);

    const showTile = (i: number) => {
      if (!grid || !marker.current || !canvas.height) return;
      const [x, y] = tileAt(i, grid);
      const gridW = grid.cols * grid.tileW + (grid.cols - 1) * GAP;
      const gridH = grid.rows * grid.tileH + (grid.rows - 1) * GAP;
      marker.current.style.cssText = `left:${(x / gridW) * 100}%;top:${(y / gridH) * 100}%;width:${(grid.tileW / gridW) * 100}%;height:${(grid.tileH / gridH) * 100}%;opacity:1`;
      if (scan.current) scan.current.style.transform = `translateY(${((y + grid.tileH) / gridH) * 100}%)`;
    };

    /** Pulls every frame into the wall and returns the filmstrip poster, or null if the browser can't decode this file. */
    async function pull(meta: Meta): Promise<string | null> {
      const v = el!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const times = frameTimes(meta.duration);
      total = times.length;
      grid = drawSlots(canvas!, total, box!.clientWidth, box!.clientHeight, dpr);
      setFrames({ pulled: 0, total, done: false, failed: false });
      const ctx = canvas!.getContext("2d");
      const sprite = document.createElement("canvas");
      sprite.width = POSTER_TILE_W * POSTER_TILES;
      sprite.height = POSTER_TILE_H;
      const spriteCtx = sprite.getContext("2d");
      const wanted = posterFrames(total, POSTER_TILES);
      if (!ctx || !spriteCtx) throw new Error("No canvas");
      let last = performance.now();
      for (let i = 0; i < times.length; i++) {
        if (signal.aborted) return null;
        v.currentTime = times[i];
        await once(v, "seeked", signal, 8000);
        const [x, y] = tileAt(i, grid);
        drawCover(ctx, v, x * dpr, y * dpr, grid.tileW * dpr, grid.tileH * dpr);
        wanted.forEach((frame, tile) => {
          if (frame === i) drawCover(spriteCtx, v, tile * POSTER_TILE_W, 0, POSTER_TILE_W, POSTER_TILE_H);
        });
        showTile(i);
        if (frameChip.current) frameChip.current.textContent = formatTimecode(times[i]);
        setFrames((f) => ({ ...f, pulled: i + 1 }));
        const wait = MIN_MS_PER_FRAME - (performance.now() - last);
        if (wait > 0) await sleep(wait);
        await nextFrame();
        last = performance.now();
      }
      setFrames((f) => ({ ...f, done: true }));
      return sprite.toDataURL("image/jpeg", 0.62);
    }

    /** With every frame pulled, the Reel plays on the monitor while the server works, and its frame stays lit on the wall. */
    function playOn() {
      const v = el!;
      if (signal.aborted) return;
      if (marker.current) marker.current.style.opacity = "1";
      canvas!.parentElement?.setAttribute("data-sweeping", "");
      if (scan.current) scan.current.style.transform = "";
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      v.loop = true;
      v.currentTime = 0;
      void v.play().catch(() => {});
      v.addEventListener(
        "timeupdate",
        () => {
          const i = Math.min(total - 1, Math.floor(v.currentTime * WALL_FPS));
          showTile(i);
          if (scan.current) scan.current.style.transform = "";
          if (frameChip.current) frameChip.current.textContent = formatTimecode(v.currentTime);
        },
        { signal },
      );
    }

    async function run() {
      url = URL.createObjectURL(file);
      el!.src = url;

      // What the browser can read of it. A file it can't decode can still be checked by the worker.
      let readable: Meta | null = null;
      try {
        await once(el!, "loadedmetadata", signal, 15000);
        if (Number.isFinite(el!.duration) && el!.duration > 0) readable = { duration: el!.duration, width: el!.videoWidth, height: el!.videoHeight };
      } catch (error) {
        if (signal.aborted) return;
        console.warn("The browser can't read this file:", error);
      }
      if (readable && readable.duration > MAX_DURATION_S) {
        onCancel(`This video runs ${formatSeconds(readable.duration)}. The limit is ${formatSeconds(MAX_DURATION_S)}.`);
        return;
      }
      setMeta(readable);

      const posterJob: Promise<string | null> = readable
        ? pull(readable).catch((error) => {
            if (!signal.aborted) {
              console.warn("Frames stopped:", error);
              setFrames((f) => ({ ...f, failed: true }));
            }
            return null;
          })
        : Promise.resolve(null);
      if (!readable) setFrames((f) => ({ ...f, failed: true }));
      void posterJob.then(() => playOn());

      await sendAndCheck(posterJob);
    }

    async function sendAndCheck(posterJob: Promise<string | null>) {
      const controller = new AbortController();
      uploadAbort.current = controller;
      signal.addEventListener("abort", () => controller.abort(), { once: true });
      let blobUrl: string;
      try {
        const blob = await upload(blobPathname(file.name), file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType: contentTypeFor(file) ?? undefined,
          multipart: file.size > 20 * 1024 * 1024,
          abortSignal: controller.signal,
          onUploadProgress: ({ loaded, percentage }) => setSent({ loaded, share: percentage / 100, done: false }),
        });
        blobUrl = blob.url;
      } catch (error) {
        if (controller.signal.aborted) return;
        setFailure({ step: "upload", message: (error as Error).message || "The upload stopped. Check your connection and try again." });
        return;
      } finally {
        uploadAbort.current = null;
      }
      setSent({ loaded: file.size, share: 1, done: true });

      const poster = await Promise.race([posterJob, sleep(POSTER_WAIT_MS).then(() => null)]);
      if (signal.aborted) return;
      serverStarted = performance.now();
      setCheckStarted(true);
      const response = await fetch("/api/reels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: blobUrl, filename: file.name, poster }),
        signal,
      }).catch(() => null);
      if (signal.aborted) return;
      const body = (await response?.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (body?.id) {
        const href = response?.ok ? `/dashboard/reels/${body.id}` : `/dashboard/reels/${body.id}?error=${encodeURIComponent(body.error ?? "The check failed.")}`;
        window.clearInterval(clockTimer);
        setFinished(true);
        router.prefetch(href);
        startNavigation(() => router.push(href));
      } else {
        setFailure({ step: "check", message: body?.error ?? (response ? `The check failed (HTTP ${response.status}).` : "The check stopped. Check your connection and try again.") });
        window.clearInterval(clockTimer);
      }
    }

    // In a timer so Strict Mode's second mount, which clears it, doesn't start a second upload.
    const begin = window.setTimeout(() => void run(), 0);
    return () => {
      window.clearTimeout(begin);
      window.clearInterval(clockTimer);
      stopped.abort();
      el.pause();
      el.removeAttribute("src");
      el.load();
      if (url) URL.revokeObjectURL(url);
    };
    // The check runs once per file; retrying mounts a new stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const uploadStep = failure?.step === "upload" ? "fail" : sent.done ? "done" : "active";
  const checkStep = failure?.step === "check" ? "fail" : finished ? "done" : checkStarted ? "active" : "waiting";

  return (
    <section aria-label={`Checking ${file.name}`} className={cn("check-stage", finished && "check-stage-handover")} aria-busy={!finished && !failure}>
      <header className="check-top">
        <p className="min-w-0 truncate font-mono text-[13px] text-[var(--paper-100)]">{file.name}</p>
        <p className="hidden min-w-0 truncate font-mono text-[12px] text-[var(--stone-400)] sm:block">
          {meta ? `${meta.width}×${meta.height} · ${formatTimecode(meta.duration)} · ` : ""}
          {formatBytes(file.size)}
        </p>
        <p className="ml-auto flex shrink-0 items-baseline gap-2 text-[var(--paper-100)]">
          <span className="text-[12px] text-[var(--stone-400)]">Elapsed</span>
          <span ref={clock} className="font-mono text-[20px] leading-none font-medium tabular-nums">
            00:00.0
          </span>
        </p>
      </header>

      <div className="check-body">
        <div className="check-monitor">
          <video ref={video} muted playsInline preload="auto" aria-hidden="true" className="size-full object-cover" />
          <span ref={frameChip} className="absolute top-2 left-2 rounded-[4px] bg-[rgb(18_18_18/0.72)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--paper-100)] tabular-nums">
            00:00.0
          </span>
        </div>
        <div ref={wallBox} className="check-wall">
          <canvas ref={wall} aria-hidden="true" className="check-wall-canvas" />
          <span className="check-wall-overlay" aria-hidden="true">
            <span ref={marker} className="check-marker" />
            <span ref={scan} className="check-scan" />
          </span>
          {frames.failed ? <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-[var(--stone-400)]">This browser can&rsquo;t preview this file. The check still runs.</p> : null}
        </div>
      </div>

      <ol className="check-steps">
        <Step
          number={1}
          state={frames.failed ? "skipped" : frames.done ? "done" : "active"}
          title="Frames from your file"
          right={frames.total ? `${frames.pulled} of ${frames.total}` : null}
          bar={frames.total ? frames.pulled / frames.total : 0}
        >
          Pulled in this browser, {WALL_FPS} a second. That&rsquo;s the rate the model reads.
        </Step>
        <Step number={2} state={uploadStep} title="Upload" right={failure?.step === "upload" ? null : `${Math.round(sent.share * 100)}%`} bar={sent.share}>
          {failure?.step === "upload" ? failure.message : `${formatBytes(Math.max(sent.loaded, 1024))} of ${formatBytes(file.size)}`}
        </Step>
        <Step
          number={3}
          state={checkStep}
          title={finished ? "Report ready" : "On the server"}
          right={
            checkStarted ? (
              <span ref={serverClock} className="tabular-nums">
                00:00.0
              </span>
            ) : null
          }
        >
          {failure?.step === "check" ? (
            failure.message
          ) : analysis === "sample" ? (
            "No worker is connected here, so a sample report stands in."
          ) : (
            <span className="grid gap-0.5">
              <span>Muse Spark Open on Baseten reads the frames.</span>
              <span>Muse Voice Transcribe on the Meta Model API reads the audio.</span>
              <span>Then plain rules time the label against ASCI&rsquo;s clauses.</span>
            </span>
          )}
        </Step>
      </ol>

      {failure || (!sent.done && !finished) ? (
        <footer className="check-actions">
          {failure ? (
            <>
              <Button type="button" size="compact" onClick={onRetry}>
                Try again
              </Button>
              <Button type="button" variant="outline" size="compact" onClick={() => onCancel()}>
                Choose another video
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="compact"
              onClick={() => {
                uploadAbort.current?.abort();
                onCancel();
              }}
            >
              <X size={15} aria-hidden="true" />
              Cancel
            </Button>
          )}
        </footer>
      ) : null}
      <p className="sr-only" role="status">
        {finished ? (navigating ? "Report ready. Opening it." : "Report ready.") : failure ? `Stopped: ${failure.message}` : checkStarted ? "The server is checking the Reel." : "Uploading."}
      </p>
    </section>
  );
}

function Step({
  number,
  state,
  title,
  right,
  bar,
  children,
}: {
  number: number;
  state: "waiting" | "active" | "done" | "fail" | "skipped";
  title: string;
  right?: React.ReactNode;
  bar?: number;
  children: React.ReactNode;
}) {
  return (
    <li className="check-step" data-state={state}>
      <span className="check-step-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${state === "done" ? 1 : (bar ?? 0)})` }} />
      </span>
      <p className="flex items-center gap-2 text-[14px] font-bold">
        <span aria-hidden="true" className="check-step-mark">
          {state === "done" ? <Check size={12} strokeWidth={3} /> : state === "fail" ? <X size={12} strokeWidth={3} /> : state === "active" ? <Loader size={12} strokeWidth={3} className="check-spin" /> : number}
        </span>
        {title}
        {right ? <span className="ml-auto font-mono text-[13px] font-medium tabular-nums">{right}</span> : null}
      </p>
      <div className="mt-1 text-[13px] leading-[1.4] text-[var(--stone-400)]">{children}</div>
    </li>
  );
}

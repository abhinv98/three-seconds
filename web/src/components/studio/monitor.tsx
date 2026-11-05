"use client";

import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BrandKit, type Box, type Moment } from "@/lib/details";
import { cn } from "@/lib/utils";
import type { Clock } from "./clock";
import { aspectValue, buildCamera, cameraAt, clamp, fixesAt, type ReframeAspect, type SceneIndex } from "./geometry";
import { drawOverlay, type Layers } from "./overlay";

const FALLBACK_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const monoFont = () => getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || FALLBACK_MONO;

const STAGE_MARGIN = 16;

function fit(aspect: number, width: number, height: number) {
  if (width <= 0 || height <= 0) return { w: 0, h: 0 };
  return width / height > aspect ? { w: height * aspect, h: height } : { w: width, h: width / aspect };
}

const place = ([x, y, w, h]: Box) => ({ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });

export interface MonitorProps {
  src: string;
  poster?: string;
  filename: string;
  width: number;
  height: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  clock: Clock;
  ix: SceneIndex | null;
  layers: Layers;
  selected: { moment: Moment; n: number } | null;
  moments: Moment[];
  brand: Pick<BrandKit, "logo" | "colors"> | null;
  brandFont: string;
  labelSpans: { t_start: number; t_end: number }[];
  wipe: boolean;
  reframe: ReframeAspect | null;
  scaleUp: boolean;
  onToggle: () => void;
}

export function Monitor({ src, poster, filename, width, height, videoRef, clock, ix, layers, selected, moments, brand, brandFont, labelSpans, wipe, reframe, scaleUp, onToggle }: MonitorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0, dpr: 1 });
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [fixKey, setFixKey] = useState("");

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight, dpr: Math.min(2, window.devicePixelRatio || 1) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const logoSrc = brand?.logo ?? "";
  useEffect(() => {
    if (!logoSrc) return;
    const image = new Image();
    image.onload = () => setLogoImage(image);
    image.src = logoSrc;
  }, [logoSrc]);

  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && setFontsReady((n) => n + 1));
    return () => {
      alive = false;
    };
  }, []);

  const camera = useMemo(() => (ix && reframe ? buildCamera(ix, aspectValue(reframe)) : null), [ix, reframe]);
  const scaled = Boolean(camera && scaleUp);
  const frameAspect = width && height ? width / height : 9 / 16;
  const frame = fit(scaled && reframe ? aspectValue(reframe) : frameAspect, stage.w - STAGE_MARGIN, stage.h - STAGE_MARGIN);
  const inner = scaled && camera ? { w: frame.w / camera.w, h: frame.w / camera.w / frameAspect } : frame;
  const cssW = Math.round(inner.w);
  const cssH = Math.round(inner.h);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !cssW) return;
    const { dpr } = stage;
    const mono = monoFont();
    const paint = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const crop = camera ? cameraAt(camera, t) : null;
      drawOverlay(ctx, {
        t,
        width: cssW,
        height: cssH,
        dpr,
        layers,
        ix,
        selected,
        labelSpans,
        logoImage,
        crop: scaled ? null : crop,
        cropName: reframe ?? "",
        mono,
      });
      const el = innerRef.current;
      if (el) el.style.transform = scaled && crop ? `translate3d(${-crop[0] * cssW}px, ${-crop[1] * cssH}px, 0)` : "";
      const key = layers.fixes ? fixesAt(moments, t, selected?.moment.id ?? null).map((f) => f.id).join(",") : "";
      setFixKey((known) => (known === key ? known : key));
    };
    paint(clock.t);
    return clock.on(paint);
    // fontsReady: canvas text is drawn once with the fallback before JetBrains Mono arrives.
  }, [clock, ix, layers, selected, moments, labelSpans, logoImage, camera, scaled, reframe, cssW, cssH, stage, fontsReady]);

  const fixes = useMemo(() => {
    const ids = fixKey ? fixKey.split(",") : [];
    return ids.flatMap((id) => {
      const fix = moments.find((m) => m.id === id)?.fix;
      return fix ? [{ id, fix }] : [];
    });
  }, [fixKey, moments]);
  const accent = brand?.colors[0]?.hex ?? "#ea4e12";
  const ink = brand?.colors[brand.colors.length - 1]?.hex ?? "#121212";

  return (
    <div ref={stageRef} className="st-stage">
      <div
        ref={frameRef}
        className="st-frame"
        style={{ width: frame.w || undefined, height: frame.h || undefined, visibility: frame.w ? "visible" : "hidden" }}
      >
        <div ref={innerRef} className="st-frame-inner" style={{ width: cssW, height: cssH }}>
          {/* The Blob store the video redirects to answers with CORS, and anonymous is what keeps the still download's canvas clean. */}
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            crossOrigin="anonymous"
            playsInline
            preload="auto"
            className="st-video"
            aria-label={`Video: ${filename}`}
            onClick={onToggle}
            onError={() => setVideoFailed(true)}
          />
          <canvas ref={canvasRef} aria-hidden="true" className="st-overlay" width={Math.round(cssW * stage.dpr)} height={Math.round(cssH * stage.dpr)} style={{ width: cssW, height: cssH }} />
          {layers.fixes ? (
            <div aria-hidden="true" className={cn("st-fixes", wipe && "st-fixes-wiped")}>
              {fixes.map(({ id, fix }) => (
                <div key={id} className="st-fix" style={place(fix.box)}>
                  <span
                    className={cn("st-fix-text", fix.style === "label" ? "st-fix-label" : "st-fix-round")}
                    style={{
                      fontFamily: brandFont,
                      background: fix.style === "pill" ? accent : ink,
                      color: fix.style === "pill" ? ink : fix.style === "label" ? "#ffffff" : accent,
                    }}
                  >
                    {fix.text}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {wipe && layers.fixes ? <WipeDivider frameRef={frameRef} empty={!fixes.length} /> : null}
        {videoFailed ? <p className="st-video-failed">This video couldn&rsquo;t be loaded.</p> : null}
      </div>
    </div>
  );
}

/** Drag or use the arrow keys. The position lives in a CSS variable, so dragging never re-renders anything. */
function WipeDivider({ frameRef, empty }: { frameRef: RefObject<HTMLDivElement | null>; empty: boolean }) {
  const [start] = useState(50);
  const value = useRef(start);
  const handleRef = useRef<HTMLDivElement>(null);
  const set = (percent: number) => {
    value.current = clamp(percent, 0, 100);
    frameRef.current?.style.setProperty("--wipe", `${value.current}%`);
    handleRef.current?.setAttribute("aria-valuenow", String(Math.round(value.current)));
  };
  useLayoutEffect(() => {
    frameRef.current?.style.setProperty("--wipe", "50%");
  }, [frameRef]);
  const fromPointer = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (rect?.width) set(((clientX - rect.left) / rect.width) * 100);
  };
  return (
    <div className="st-wipe">
      <span className="st-wipe-name st-wipe-a">As posted</span>
      <span className="st-wipe-name st-wipe-b">{empty ? "With fixes (none here)" : "With fixes"}</span>
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label="Wipe between as posted and with fixes"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={start}
        className="st-wipe-handle"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          e.stopPropagation();
          set(value.current + (e.key === "ArrowLeft" ? -5 : 5));
        }}
      >
        <span className="st-wipe-grip" />
      </div>
    </div>
  );
}

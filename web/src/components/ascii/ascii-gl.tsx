"use client";

import { useEffect, useRef } from "react";
import { useMotionPaused } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface PaintFrame {
  cols: number;
  rows: number;
  /** Seconds of animation time (frozen while paused or under reduced motion). */
  t: number;
  dt: number;
  /** Cell width / cell height. */
  cellAspect: number;
}

/** Paints the scene into a canvas of cols x rows pixels: one pixel per character cell. */
export type Painter = (ctx: CanvasRenderingContext2D, frame: PaintFrame) => void;

/** The sun in the sky: centre as fractions of the canvas (y down); glow and disc radii as fractions of its height. */
export interface SunGlow {
  x: number;
  y: number;
  r: number;
  disc: number;
  strength: number;
}

// Sparse to dense. The last glyph is a solid block with a hairline gap, so bright areas read as a dithered mosaic.
const RAMP = [" ", ".", "·", ":", "-", "~", "=", "+", "*", "x", "o", "%", "#", "&", "@", "█"];

const VERTEX = `attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// One fragment = one screen pixel. It finds its character cell, reads the scene colour there, picks a glyph by
// brightness (with a 4x4 Bayer dither so gradients shimmer instead of banding) and tints the glyph with the colour.
const FRAGMENT = `precision mediump float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec2 uRes;
uniform float uGlyphs;
uniform vec3 uBg;
uniform float uDither;
uniform float uGain;
uniform float uFill;
uniform float uUseSky;
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uSkyLow;
uniform vec2 uSkyStops;
uniform vec4 uGlow;
uniform float uDisc;
uniform vec3 uGlowColor;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cellSize = uRes / uGrid;
  vec2 cell = floor(frag / cellSize);
  vec2 local = fract(frag / cellSize);
  vec4 s = texture2D(uScene, (cell + 0.5) / uGrid);
  // Transparent scene pixels are sky: a smooth gradient and the sun's glow, a whisper of dither, no glyphs.
  if (uUseSky > 0.5 && s.a < 0.5) {
    float y = frag.y / uRes.y;
    vec3 sky = y < uSkyStops.x
      ? mix(uSkyTop, uSkyMid, y / uSkyStops.x)
      : mix(uSkyMid, uSkyLow, clamp((y - uSkyStops.x) / (uSkyStops.y - uSkyStops.x), 0.0, 1.0));
    if (uGlow.w > 0.0) {
      float r = length(vec2((frag.x / uRes.x - uGlow.x) * uRes.x / uRes.y, y - uGlow.y));
      float d = r / uGlow.z;
      sky = mix(sky, uGlowColor, uGlow.w * exp(-d * d));
      float edge = 1.5 / uRes.y;
      sky = mix(sky, mix(uGlowColor, vec3(1.0), 0.45), smoothstep(uDisc + edge, uDisc - edge, r));
    }
    sky += (bayer4(floor(frag / 2.0)) - 0.5) * 0.018;
    gl_FragColor = vec4(sky, 1.0);
    return;
  }
  vec3 c = s.rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float d = clamp(lum * uGain + (bayer4(cell) - 0.5) * uDither, 0.0, 0.9999);
  float idx = floor(d * uGlyphs);
  float mask = texture2D(uAtlas, vec2((idx + local.x) / 16.0, local.y)).a;
  float peak = max(c.r, max(c.g, c.b));
  vec3 tint = peak > 0.0 ? c / peak : vec3(0.0);
  tint *= mix(0.62, 1.04, lum);
  // Each cell sits on a dim wash of its own colour, so the picture glows instead of floating on black.
  vec3 base = mix(uBg, c, uFill);
  // With a sky, alpha 0.55..1 is glyph strength: at 0.55 the cell is a flat fill of its colour.
  float strength = uUseSky > 0.5 ? clamp((s.a - 0.55) / 0.45, 0.0, 1.0) : 1.0;
  gl_FragColor = vec4(mix(c, mix(base, tint, mask), strength), 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function makeAtlas(family: string, glyphs: string[]) {
  const gw = 32;
  const gh = 64;
  const canvas = document.createElement("canvas");
  canvas.width = gw * 16;
  canvas.height = gh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(gh * 0.6)}px ${family}`;
  glyphs.forEach((glyph, i) => {
    if (glyph === "█") ctx.fillRect(i * gw + 2, 3, gw - 4, gh - 6);
    else if (glyph !== " ") ctx.fillText(glyph, i * gw + gw / 2, gh / 2 + 2);
  });
  return canvas;
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "compile");
  return shader;
}

interface AsciiGLProps {
  paint: Painter;
  /** Character cell size in CSS px, by viewport width. */
  cell?: (width: number) => { w: number; h: number };
  background?: string;
  dither?: number;
  gain?: number;
  /** How much of each cell's colour washes its background, 0..1. */
  fill?: number;
  /** Glyphs from sparse to dense, at most 16. Pass a module constant. */
  ramp?: string[];
  /** Sky gradient (top, middle, low) drawn wherever the painter leaves pixels transparent. Pass a module constant. */
  sky?: [string, string, string];
  /** Where the sky reaches its middle and low colours, as fractions of the height. Pass a module constant. */
  skyStops?: [number, number];
  /** The sun's glow in the sky, read every frame. */
  sun?: () => SunGlow | null;
  sunColor?: string;
  /** Animation time drawn under reduced motion. */
  stillTime?: number;
  /** Re-render while time is frozen only when this changes (e.g. scroll progress). */
  version?: () => number;
  className?: string;
}

const DEFAULT_CELL = (width: number) => (width < 640 ? { w: 6, h: 10 } : { w: 7, h: 12 });
const DEFAULT_STOPS: [number, number] = [0.55, 1];

/**
 * A full-bleed colour ASCII renderer. The scene is painted with Canvas 2D at one pixel per character cell,
 * uploaded as a texture, and turned into tinted glyphs by a WebGL shader. Falls back to a pixelated
 * dither of the same scene when WebGL is unavailable.
 */
export function AsciiGL({
  paint,
  cell = DEFAULT_CELL,
  background = "#0d0a12",
  dither = 0.16,
  gain = 1.2,
  fill = 0.3,
  ramp,
  sky,
  skyStops = DEFAULT_STOPS,
  sun,
  sunColor = "#ffffff",
  stillTime = 0,
  version,
  className,
}: AsciiGLProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(paint);
  const versionRef = useRef(version);
  const cellRef = useRef(cell);
  const sunRef = useRef(sun);
  // Animation time survives the effect restarting (pause/play), so the scene doesn't jump.
  const timeRef = useRef<number | null>(null);
  const paused = useMotionPaused();
  useEffect(() => {
    paintRef.current = paint;
    versionRef.current = version;
    cellRef.current = cell;
    sunRef.current = sun;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frozen = reduce || paused;
    const glyphs = (ramp ?? RAMP).slice(0, 16);
    const scene = document.createElement("canvas");
    const sctx = scene.getContext("2d");
    if (!sctx) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
    const ctx2d = gl ? null : canvas.getContext("2d");

    let program: WebGLProgram | null = null;
    let sceneTex: WebGLTexture | null = null;
    let atlasTex: WebGLTexture | null = null;
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    let cols = 1;
    let rows = 1;
    let cellAspect = 0.58;
    let frame = 0;
    let visible = false;
    if (timeRef.current === null || reduce) timeRef.current = reduce ? stillTime : 0;
    let last = performance.now();
    let lastVersion = Number.NaN;
    let ready = false;
    let cancelled = false;

    const setup = (family: string) => {
      if (!gl) return;
      program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, "aPos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const name of [
        "uScene",
        "uAtlas",
        "uGrid",
        "uRes",
        "uGlyphs",
        "uBg",
        "uDither",
        "uGain",
        "uFill",
        "uUseSky",
        "uSkyTop",
        "uSkyMid",
        "uSkyLow",
        "uSkyStops",
        "uGlow",
        "uDisc",
        "uGlowColor",
      ]) {
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      atlasTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas(family, glyphs));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      sceneTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.uniform1i(uniforms.uScene, 0);
      gl.uniform1i(uniforms.uAtlas, 1);
      gl.uniform1f(uniforms.uGlyphs, glyphs.length);
      gl.uniform1f(uniforms.uUseSky, sky ? 1 : 0);
      if (sky) {
        gl.uniform3fv(uniforms.uSkyTop, hexToRgb(sky[0]));
        gl.uniform3fv(uniforms.uSkyMid, hexToRgb(sky[1]));
        gl.uniform3fv(uniforms.uSkyLow, hexToRgb(sky[2]));
        gl.uniform2f(uniforms.uSkyStops, skyStops[0], skyStops[1]);
        gl.uniform3fv(uniforms.uGlowColor, hexToRgb(sunColor));
      }
      gl.uniform3fv(uniforms.uBg, hexToRgb(background));
      gl.uniform1f(uniforms.uDither, dither);
      gl.uniform1f(uniforms.uGain, gain);
      gl.uniform1f(uniforms.uFill, fill);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const size = cellRef.current(rect.width);
      cols = Math.max(1, Math.round(rect.width / size.w));
      rows = Math.max(1, Math.round(rect.height / size.h));
      cellAspect = rect.width / cols / (rect.height / rows);
      scene.width = cols;
      scene.height = rows;
      if (gl && program) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uniforms.uGrid, cols, rows);
        gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      }
      lastVersion = Number.NaN;
    };

    const render = (now: number) => {
      const dt = frozen ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (timeRef.current ?? 0) + dt;
      timeRef.current = t;
      const v = versionRef.current ? versionRef.current() : 0;
      if (dt === 0 && v === lastVersion) return;
      lastVersion = v;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      paintRef.current(sctx, { cols, rows, t, dt, cellAspect });
      if (gl && program) {
        const glow = sunRef.current?.() ?? null;
        gl.uniform4f(uniforms.uGlow, glow?.x ?? 0, glow?.y ?? 0, glow?.r ?? 1, glow?.strength ?? 0);
        gl.uniform1f(uniforms.uDisc, glow?.disc ?? 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else if (ctx2d) {
        ctx2d.imageSmoothingEnabled = false;
        ctx2d.drawImage(scene, 0, 0, canvas.width, canvas.height);
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (visible && !document.hidden && ready) render(now);
    };

    const family =
      getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim() ||
      '"JetBrains Mono", ui-monospace, monospace';
    void document.fonts.load(`600 40px ${family}`).finally(() => {
      if (cancelled) return;
      try {
        setup(family);
      } catch {
        // A driver that refuses the shader gets the pixel-dither fallback on the next mount.
      }
      resize();
      ready = true;
      last = performance.now();
      render(last);
      // Fade in over the CSS fallback behind the canvas.
      canvas.style.opacity = "1";
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!ready) return;
      resize();
      render(performance.now());
    });
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = performance.now();
    });
    intersection.observe(canvas);
    frame = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      if (gl && program) gl.deleteProgram(program);
      if (gl) [sceneTex, atlasTex].forEach((texture) => texture && gl.deleteTexture(texture));
    };
  }, [background, dither, gain, fill, ramp, sky, skyStops, sunColor, stillTime, paused]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block h-full w-full opacity-0 transition-opacity duration-700 ease-out", className)}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { pixel } from "@/components/cave3d/font";
import { Sound } from "@/components/cave3d/sound";
import type { Result } from "@/components/cave3d/engine";
import { readLock, writeLock } from "@/lib/cave-lock";
import { whereIsTickle } from "@/lib/ist";

// After six, when Mr Tickle has gone home, a zip hangs at the top of the page. Pull it all the way down and the
// website opens like a fly, and behind it is a cave (components/cave3d). When the game ends the page zips itself back
// up, and if he won, his hand comes in from the side and takes the zip away until tomorrow.

const CavePlay = dynamic(
  () => import("@/components/cave3d/cave-game").then((m) => m.CavePlay),
  { ssr: false },
);

type Mode =
  | "hidden"
  | "idle"
  | "locked"
  | "pulling"
  | "opening"
  | "open"
  | "closing"
  | "snatch";
const TOOTH = 9;

export function Zipper() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [pull, setPull] = useState(0);
  const [spread, setSpread] = useState(0);
  const [vh, setVh] = useState(800);
  const [vw, setVw] = useState(1200);
  const [toast, setToast] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const drag = useRef<{ from: number; zipped: number } | null>(null);
  const anim = useRef(0);

  // Shown only while he is home, and only if today's run hasn't happened.
  useEffect(() => {
    const read = () => {
      setVh(window.innerHeight);
      setVw(window.innerWidth);
      setMode((m) => {
        if (m !== "hidden" && m !== "idle" && m !== "locked") return m;
        if (whereIsTickle(Date.now(), location.search) !== "home")
          return "hidden";
        const lock = readLock();
        return !lock ? "idle" : lock.outcome === "won" ? "locked" : "hidden";
      });
    };
    const first = window.setTimeout(read, 0);
    const id = window.setInterval(read, 5000);
    window.addEventListener("resize", read);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener("resize", read);
      cancelAnimationFrame(anim.current);
    };
  }, []);

  // The page itself: clipped open down the middle while the zip is undone, hidden while the game runs.
  const active =
    mode === "pulling" ||
    mode === "opening" ||
    mode === "open" ||
    mode === "closing";
  useEffect(() => {
    const lp = document.querySelector<HTMLElement>(".lp");
    const root = document.documentElement;
    if (!lp) return;
    if (!active) {
      lp.style.removeProperty("clip-path");
      lp.style.removeProperty("visibility");
      root.style.removeProperty("overflow");
      return;
    }
    root.style.overflow = "hidden";
    lp.style.position = "relative";
    lp.style.zIndex = "1";
    lp.style.background = "var(--lp-ground)";
    lp.style.visibility = mode === "open" ? "hidden" : "visible";
    const top = -lp.getBoundingClientRect().top;
    const w = window.innerWidth;
    const h = lp.scrollHeight;
    const pts = edges(w, pull, spread);
    const left = pts.map(([x, y]) => `${x}px ${top + y}px`);
    const right = pts.map(([x, y]) => `${w - x}px ${top + y}px`).reverse();
    lp.style.clipPath = `polygon(0 ${top - 2}px, ${left.join(", ")}, ${right.join(", ")}, ${w}px ${top - 2}px, ${w}px ${h}px, 0 ${h}px)`;
  }, [active, mode, pull, spread]);

  const ensureSound = () => {
    if (sound) {
      sound.start();
      return sound;
    }
    const s = new Sound();
    s.start();
    setSound(s);
    return s;
  };
  /** Moves the zip to `to` px over `ms`, clicking a tooth at a time. */
  const tween = (
    from: number,
    to: number,
    ms: number,
    done: () => void,
    set = setPull,
    s = sound,
  ) => {
    cancelAnimationFrame(anim.current);
    const t0 = performance.now();
    let lastTooth = Math.floor(from / TOOTH);
    const step = () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0) / ms));
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const v = from + (to - from) * e;
      set(v);
      if (set === setPull && Math.floor(v / TOOTH) !== lastTooth) {
        lastTooth = Math.floor(v / TOOTH);
        s?.zip();
      }
      if (k < 1) anim.current = requestAnimationFrame(step);
      else done();
    };
    anim.current = requestAnimationFrame(step);
  };
  const open = (s: Sound, from: number) => {
    setMode("opening");
    tween(
      from,
      vh,
      Math.max(250, (vh - from) * 1.4),
      () => {
        s.rip();
        tween(0, 1, 650, () => setMode("open"), setSpread, s);
      },
      setPull,
      s,
    );
  };
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (mode !== "idle") return;
    e.preventDefault();
    ensureSound();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { from: e.clientY - pull, zipped: pull };
    setMode("pulling");
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || mode !== "pulling") return;
    const next = Math.max(0, Math.min(vh, e.clientY - d.from));
    if (Math.floor(next / TOOTH) !== Math.floor(d.zipped / TOOTH))
      sound?.zip(0);
    d.zipped = next;
    setPull(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || mode !== "pulling") return;
    const s = ensureSound();
    // A tap (no pull) or a pull most of the way: it opens. Otherwise it springs back up.
    if (d.zipped < 6 || d.zipped > vh * 0.72) open(s, d.zipped);
    else tween(d.zipped, 0, 380, () => setMode("idle"), setPull, s);
  };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (mode !== "idle" || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    open(ensureSound(), 0);
  };

  const onEnd = (result: Result | null) => {
    if (result) writeLock(result.outcome, result.seconds);
    setMode("closing");
    // The flaps come back together, then the zip runs up to the top.
    tween(
      1,
      0,
      600,
      () =>
        tween(vh, 0, 1500, () => {
          if (!result || result.outcome === "won") {
            setMode(result ? "locked" : "idle");
            if (result)
              setToast("You escaped. The zip is yours again tomorrow.");
            return;
          }
          // His hand comes in from the side and takes the zip with it.
          setMode("snatch");
          sound?.rip();
          window.setTimeout(() => {
            setMode("hidden");
            setToast("Mr Tickle took the zip. Back tomorrow.");
          }, 2300);
        }),
      setSpread,
    );
  };
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const pts = edges(vw, pull, spread);
  const showZip = mode !== "hidden" && mode !== "open";
  return (
    <>
      {(active || mode === "snatch") && sound && (
        <div className={pixel.variable}>
          <CavePlay
            mode="landing"
            live={mode === "open"}
            sound={sound}
            onEnd={onEnd}
            onLeave={() => onEnd(null)}
          />
        </div>
      )}
      {showZip && (
        <div
          className="lp-zip"
          data-mode={mode}
          aria-hidden={mode === "locked" || undefined}
        >
          {active && (
            <svg
              className="lp-zip__teeth"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              {pts.slice(0, -1).map(([x, y], i) => (
                <g key={i}>
                  <rect x={x - 6} y={y} width={7} height={4} />
                  <rect x={vw - x - 1} y={y + 4} width={7} height={4} />
                </g>
              ))}
            </svg>
          )}
          <span
            className="lp-zip__track"
            style={{ top: pull }}
            aria-hidden="true"
          />
          {
            <button
              type="button"
              className="lp-zip__pull"
              style={{ top: pull }}
              disabled={mode === "locked" || mode === "snatch"}
              aria-label={
                mode === "locked"
                  ? "You escaped today. The zip opens again tomorrow."
                  : "Unzip the website"
              }
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKey}
            >
              <span className="lp-zip__slider" />
              <span className="lp-zip__tab" />
              <span className="lp-zip__tip">
                {mode === "locked" ? "Back tomorrow" : "Pull me"}
              </span>
            </button>
          }
          {mode === "snatch" && <Hand />}
        </div>
      )}
      {toast && (
        <p className="lp-zip__toast" role="status">
          {toast}
        </p>
      )}
    </>
  );
}

/** The two sides of the opening, as points from the top of the screen down to the slider: [x of the left side, y]. */
function edges(w: number, pull: number, spread: number): [number, number][] {
  const cx = w / 2;
  const top = Math.min(w * 0.42, pull * 0.42 + 6) * (1 + spread * 4);
  const out: [number, number][] = [];
  for (let y = 0; y <= pull; y += TOOTH) {
    const k = pull ? y / pull : 1;
    out.push([cx - top * Math.pow(1 - k, 0.8) - 3, y]);
  }
  out.push([cx, pull]);
  return out;
}

/** His hand: a black pixel mitten, a film-strip band in red at the wrist, the zip between finger and thumb. */
function Hand() {
  return (
    <svg
      className="lp-hand"
      viewBox="0 0 64 24"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="18" y="8" width="46" height="8" fill="#121212" />
      <rect x="24" y="6" width="7" height="12" fill="#b3152f" />
      {[7, 10, 13, 16].map((y) => (
        <rect key={y} x="26" y={y} width="2" height="1" fill="#fbfaf6" />
      ))}
      <rect x="6" y="4" width="14" height="16" fill="#121212" />
      <rect x="4" y="6" width="2" height="12" fill="#121212" />
      <rect x="8" y="6" width="3" height="2" fill="#3a3530" />
      <rect x="0" y="8" width="5" height="3" fill="#121212" />
      <rect x="0" y="13" width="5" height="3" fill="#121212" />
      <rect
        className="lp-hand__zip"
        x="1"
        y="10"
        width="4"
        height="8"
        fill="#c9a24b"
      />
    </svg>
  );
}

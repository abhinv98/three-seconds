"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { springStep, type SpringState } from "@/lib/spring";
import { useSulking } from "@/lib/tickle";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Tick, type TickCard, type TickMood } from "./tick";

// The sample Reel, one frame per second (public/landing/filmstrip.jpg: 28 frames of 96 x 170, taken at k + 0.5 s),
// runs along a curve under Tickle. Scrolling moves the Reel through time. He reads it through a fixed window under
// his feet: whatever passes through the window shows as characters, the way the checker sees it.
const FRAMES = 28;
const SPRITE_W = 96;
const SPRITE_H = 170;
const LABEL = { start: 0.4, end: 2.2 };
const NEED = 28 / 3; // ASCI 1.2e.II: a third of the 28.0 s Reel
const NEED_END = LABEL.start + NEED;
const STORY_END = 11; // seconds of the Reel the scroll walks through; the call is made at NEED_END
const RAMP = " .:-=+*x#%@";
const DIZZY = 16; // Reel seconds per second of scrolling; faster than this and he can't keep up

type Pt = { x: number; y: number; a: number };

/** A cubic Bézier sampled by arc length, so things can be placed along it at even spacing. */
function makePath(p: number[][]) {
  const pts: Pt[] = [];
  const lens: number[] = [];
  let len = 0;
  let prev: Pt | null = null;
  for (let i = 0; i <= 600; i++) {
    const t = i / 600;
    const u = 1 - t;
    const x = u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
    const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
    const pt = { x, y, a: Math.atan2(dy, dx) };
    if (prev) len += Math.hypot(x - prev.x, y - prev.y);
    pts.push(pt);
    lens.push(len);
    prev = pt;
  }
  const at = (s: number): Pt => {
    const target = Math.min(Math.max(s, 0), len);
    let lo = 0;
    let hi = lens.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lens[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return pts[lo];
  };
  const d = `M${p[0].join(",")} C${p[1].join(",")} ${p[2].join(",")} ${p[3].join(",")}`;
  return { at, length: len, d };
}

/** Each frame of the strip as characters, the way the checker reads it. */
function asciiFrames(img: HTMLImageElement): string[] {
  const cols = 16;
  const rows = 28;
  const sample = document.createElement("canvas");
  sample.width = cols * FRAMES;
  sample.height = rows;
  const sctx = sample.getContext("2d", { willReadFrequently: true });
  if (!sctx) return [];
  sctx.drawImage(img, 0, 0, sample.width, rows);
  const data = sctx.getImageData(0, 0, sample.width, rows).data;
  const out = document.createElement("canvas");
  out.width = SPRITE_W;
  out.height = SPRITE_H;
  const octx = out.getContext("2d");
  if (!octx) return [];
  const urls: string[] = [];
  for (let f = 0; f < FRAMES; f++) {
    octx.fillStyle = "#121212";
    octx.fillRect(0, 0, SPRITE_W, SPRITE_H);
    octx.font = "600 7px ui-monospace, Menlo, monospace"; // taste-skill-ignore: canvas glyphs, not page text
    octx.textBaseline = "top";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * sample.width + f * cols + c) * 4;
        const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        octx.fillStyle = r < 4 && c < 11 ? "#ff8a52" : "#f3f1ea";
        octx.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))], c * 6, r * 6 + 1);
      }
    }
    urls.push(out.toDataURL("image/png"));
  }
  return urls;
}

function story(t: number, sulking: boolean): { mood: TickMood; lcd: string; card: TickCard; say: string } {
  if (t < 0.05)
    return {
      mood: "read",
      lcd: "0.0",
      card: null,
      say: sulking ? "Scroll. I’ll check it anyway." : "Scroll, and I’ll check the sample Reel.",
    };
  if (t < LABEL.start) return { mood: "read", lcd: "0.0", card: null, say: "Reading the sample Reel from 00:00.0." };
  if (t <= LABEL.end)
    return { mood: "count", lcd: (t - LABEL.start).toFixed(1), card: null, say: "“Paid partnership” is on screen. Timing it." };
  if (t < NEED_END)
    return { mood: "read", lcd: "1.8", card: null, say: "Gone at 00:02.2. This Reel needs it until 00:09.7." };
  return { mood: "fail", lcd: "1.8", card: "fail", say: "Fail. Held 1.8s; this 28.0s Reel needs 9.33s." };
}

export function HeroRibbon() {
  const reduced = useReducedMotion();
  const sulking = useSulking();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState({ t: 0, v: 0 });
  const [dizzy, setDizzy] = useState(false);
  const [ascii, setAscii] = useState<string[]>([]);
  const [geo, setGeo] = useState<{ w: number; h: number; fw: number } | null>(null);

  // ASCII versions of the frames, made once from the strip itself.
  useEffect(() => {
    const img = new Image();
    img.onload = () => setAscii(asciiFrames(img));
    img.src = "/landing/filmstrip.jpg";
  }, []);

  // Stage size decides the curve, the frame size and Tickle's size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      setGeo({ w, h, fw: Math.round(Math.min(96, Math.max(54, w * 0.058))) });
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Scroll inside the hero's runway sets the Reel time; a spring gives it weight without lag.
  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;
    let goal = 0;
    let state: SpringState = { x: 0, v: 0 };
    let frame = 0;
    let last = 0;
    let dizzyTimer = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      state = springStep(state, goal, 0.09, dt);
      const settled = Math.abs(state.x - goal) < 0.002 && Math.abs(state.v) < 0.01;
      setRun(settled ? { t: goal, v: 0 } : { t: state.x, v: state.v });
      // Flung through the Reel faster than he can read: a moment of spinning eyes.
      if (Math.abs(state.v) > DIZZY) {
        setDizzy(true);
        window.clearTimeout(dizzyTimer);
        dizzyTimer = window.setTimeout(() => setDizzy(false), 1300);
      }
      frame = settled ? 0 : requestAnimationFrame(tick);
    };
    // The loop runs only while the Reel time is catching up with the scroll, then sleeps.
    const read = () => {
      const run = section.offsetHeight - stage.offsetHeight;
      const top = parseFloat(getComputedStyle(stage).top) || 0;
      const scrolled = Math.min(Math.max(top - section.getBoundingClientRect().top, 0), Math.max(run, 1));
      goal = run > 0 ? (scrolled / run) * STORY_END : 0;
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(dizzyTimer);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [reduced]);

  const time = reduced ? STORY_END : run.t;
  const now = story(time, sulking);
  const v = reduced ? 0 : run.v;
  // He leans into the scroll and looks towards the frames coming in: from the right going forward, the left going back.
  const lean = Math.max(-9, Math.min(9, v * 0.6));
  const look: [number, number] = [Math.abs(v) > 0.6 ? Math.sign(v) : 0, 1];

  let ribbon: React.ReactNode = null;
  if (geo) {
    const { w, h, fw } = geo;
    const fh = Math.round((fw * SPRITE_H) / SPRITE_W);
    const band = fh + 22;
    const narrow = w < 700;
    // The curve's box starts under the copy, so the headline never sits on the picture.
    const top = Math.round(h * (narrow ? 0.47 : 0.38));
    const rh = h - top;
    const curve = narrow
      ? [[-0.25 * w, 0.585 * rh], [0.25 * w, 0.245 * rh], [0.62 * w, 0.925 * rh], [1.25 * w, 0.434 * rh]]
      : [[-0.08 * w, 0.871 * rh], [0.3 * w, 0.387 * rh], [0.62 * w, 1.065 * rh], [1.08 * w, 0.452 * rh]];
    const path = makePath(curve);
    const pitch = fw + 6;
    const tickS = path.length * (narrow ? 0.5 : 0.6);
    const sAt = (sec: number) => tickS + (sec - time) * pitch;
    const tickPt = path.at(tickS);
    const tickSize = Math.round(fw * (narrow ? 2.3 : 2.4));
    const deg = (tickPt.a * 180) / Math.PI;
    const scanW = fw; // the reading window under his feet is one frame wide
    const seg = (a: number, b: number) => {
      const s0 = Math.max(0, sAt(a));
      const s1 = Math.min(path.length, sAt(b));
      return s1 > s0 ? { strokeDasharray: `${s1 - s0} ${path.length * 2}`, strokeDashoffset: -s0 } : { opacity: 0 };
    };
    const rimOffset = band / 2 - 5;

    ribbon = (
      <>
        <svg className="lp-ribbon" viewBox={`0 0 ${w} ${rh}`} width={w} height={rh} style={{ top, height: rh }} aria-hidden="true">
          <defs>
            <clipPath id="lp-scan" clipPathUnits="userSpaceOnUse">
              <rect x={-scanW / 2} y={-fh / 2} width={scanW} height={fh} transform={`translate(${tickPt.x} ${tickPt.y}) rotate(${deg})`} />
            </clipPath>
          </defs>
          <path d={path.d} className="lp-ribbon__need" style={{ strokeWidth: band + 18, ...seg(LABEL.start, NEED_END) }} />
          <path d={path.d} className="lp-ribbon__held" style={{ strokeWidth: band + 8, ...seg(LABEL.start, LABEL.end) }} />
          <path d={path.d} className="lp-ribbon__band" style={{ strokeWidth: band }} />
          {Array.from({ length: Math.ceil(path.length / 18) }, (_, i) => {
            const pt = path.at(i * 18 + ((time * pitch) % 18));
            const nx = -Math.sin(pt.a);
            const ny = Math.cos(pt.a);
            return [1, -1].map((side) => (
              <rect
                key={`${i}${side}`}
                x={pt.x + nx * rimOffset * side - 3}
                y={pt.y + ny * rimOffset * side - 2}
                width={6}
                height={4}
                rx={1}
                className="lp-ribbon__hole"
                transform={`rotate(${(pt.a * 180) / Math.PI} ${pt.x + nx * rimOffset * side} ${pt.y + ny * rimOffset * side})`}
              />
            ));
          })}
          {Array.from({ length: 14 }, (_, k) => {
            // Film leader before the first frame, counting down 3, 2, 1 into the Reel.
            const s = sAt(-k - 0.5);
            if (s < -fw || s > path.length + fw) return null;
            const pt = path.at(s);
            const n = k + 1;
            return (
              <g key={`leader${k}`} transform={`translate(${pt.x} ${pt.y}) rotate(${(pt.a * 180) / Math.PI})`}>
                <rect x={-fw / 2} y={-fh / 2} width={fw} height={fh} rx={3} className="lp-ribbon__leader" />
                {n <= 3 ? (
                  <>
                    <circle r={fw * 0.36} className="lp-ribbon__ring" />
                    <text className="lp-ribbon__count" style={{ fontSize: fw * 0.5 }} dy="0.35em">
                      {n}
                    </text>
                  </>
                ) : (
                  <circle r={2} className="lp-ribbon__dot" />
                )}
              </g>
            );
          })}
          {Array.from({ length: FRAMES }, (_, i) => {
            const s = sAt(i + 0.5);
            if (s < -fw || s > path.length + fw) return null;
            const pt = path.at(s);
            return (
              <g key={i} transform={`translate(${pt.x} ${pt.y}) rotate(${(pt.a * 180) / Math.PI})`}>
                <svg x={-fw / 2} y={-fh / 2} width={fw} height={fh} viewBox={`${i * SPRITE_W} 0 ${SPRITE_W} ${SPRITE_H}`}>
                  <image href="/landing/filmstrip.jpg" width={SPRITE_W * FRAMES} height={SPRITE_H} />
                </svg>
              </g>
            );
          })}
          {/* The same frames as characters, seen only through the window: a frame turns as it passes, never all at once. */}
          {ascii.length > 0 && (
            <g clipPath="url(#lp-scan)">
              {Array.from({ length: FRAMES }, (_, i) => {
                const s = sAt(i + 0.5);
                if (Math.abs(s - tickS) > scanW / 2 + fw / 2) return null;
                const pt = path.at(s);
                return (
                  <g key={i} transform={`translate(${pt.x} ${pt.y}) rotate(${(pt.a * 180) / Math.PI})`}>
                    <image href={ascii[i]} x={-fw / 2} y={-fh / 2} width={fw} height={fh} />
                  </g>
                );
              })}
            </g>
          )}
          <g className="lp-ribbon__head" transform={`translate(${tickPt.x} ${tickPt.y}) rotate(${deg})`}>
            <rect x={-scanW / 2 - 2} y={-fh / 2 - 7} width={3} height={fh + 14} rx={1.5} />
            <rect x={scanW / 2 - 1} y={-fh / 2 - 7} width={3} height={fh + 14} rx={1.5} />
            {!reduced && (
              <rect className="lp-ribbon__sweep" x={-scanW / 2} y={-fh / 2} width={scanW} height={2} style={{ "--fh": `${fh - 2}px` } as React.CSSProperties} />
            )}
          </g>
        </svg>
        <div
          className="lp-ribbon__tick"
          style={
            {
              width: tickSize,
              "--size": `${tickSize}px`,
              transform: `translate(${tickPt.x - tickSize / 2}px, ${top + tickPt.y - band / 2 - tickSize * 0.93}px)`,
              "--lean": lean.toFixed(2),
            } as React.CSSProperties
          }
        >
          <Tick
            size={tickSize}
            mood={dizzy ? "dizzy" : now.mood}
            lcd={now.lcd}
            card={dizzy ? null : now.card}
            look={look}
            outlined
            pokeable
            label="Tickle, timing the label"
            say={dizzy ? "Whoa. I read twice a second." : now.say}
          />
          {/* After six he goes home (html[data-tickle="home"]) and leaves a sign where he stood. */}
          <span className="lp-ribbon__away" aria-hidden="true">
            <span className="lp-ribbon__sign">
              Gone home.
              <span>Back at 09:00 IST</span>
            </span>
          </span>
        </div>
      </>
    );
  }

  return (
    <section ref={sectionRef} className="lp-hero2" aria-labelledby="hero-title">
      <div ref={stageRef} className="lp-hero2__stage">
        <div className="lp-hero2__copy">
          <h1 id="hero-title" className="lp-display">
            <span className="lp-mask">
              <span className="lp-line" style={{ "--i": 0 } as React.CSSProperties}>
                Ad labels,
              </span>
            </span>
            <span className="lp-mask">
              <span className="lp-line" style={{ "--i": 1 } as React.CSSProperties}>
                on the clock.
              </span>
            </span>
          </h1>
          <div className="lp-hero2__aside">
            <p className="lp-hero2__lead">
              Three Seconds checks a creator’s Reel against the ASCI influencer guidelines before it goes live: is the ad
              labelled, in words ASCI allows, for long enough?
            </p>
            <div className="lp-hero2__actions">
              <Link href="/check" className="lp-button">
                Check an ad
              </Link>
              <Link href="/report/sample" className="lp-link lp-link--underline">
                See the sample report
              </Link>
            </div>
          </div>
        </div>
        <p className="sr-only">
          Animated example: Tickle, a stopwatch, reads the sample Reel. “Paid partnership” is on screen from 00:00.4 to
          00:02.2, 1.8 seconds; a 28-second Reel needs 9.33 seconds, so the check fails.
        </p>
        {ribbon}
      </div>
    </section>
  );
}

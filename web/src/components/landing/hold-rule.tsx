"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatHold, requiredHold } from "@/lib/asci";
import { formatSeconds } from "@/lib/format";
import { MAX_DURATION_S } from "@/lib/limits";
import { springSettled, springStep, type SpringState } from "@/lib/spring";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Tick, type TickPose } from "./tick";

const MIN_S = 1;
const SCALE = [0, 15, 30, 45, 60, 75, 90];
const BACK_TO = 15; // where he drags the slider back to: a short Reel, three seconds
// Pale hands, gripping the edge of the sheet from outside.
const HAND = ["010101", "111111", "111111", "011110"];

/** Dragged to the end, he falls off the sheet ("fall"), grips its edge ("grip"), peeks back in ("peek") and drags the slider home ("drag"). */
type Spook = "off" | "fall" | "grip" | "peek" | "drag";

/** A number that follows its target on a critically damped spring (instantly under reduced motion). */
function useSpring(target: number, halflife: number) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(target);
  const state = useRef<SpringState>({ x: target, v: 0 });
  useEffect(() => {
    if (reduced) {
      state.current = { x: target, v: 0 };
      return;
    }
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      state.current = springStep(state.current, target, halflife, dt);
      const settled = springSettled(state.current, target, 0.002);
      setValue(settled ? target : state.current.x);
      if (!settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, halflife, reduced]);
  return reduced ? target : value;
}

/** The one control the product turns on: the video's length decides how long the label has to stay. */
export function HoldRule() {
  const id = useId();
  const reduced = useReducedMotion();
  const [length, setLength] = useState(12);
  // Tickle, the handle, leans against the direction he is dragged and settles back when the drag pauses.
  const [lean, setLean] = useState(0);
  const leanTimer = useRef(0);
  const [spook, setSpook] = useState<Spook>("off");
  const [relented, setRelented] = useState(false);
  const spooked = useRef(false);
  const timers = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = leanTimer;
    const all = timers;
    return () => {
      window.clearTimeout(t.current);
      all.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

  // Ninety seconds is the most a check takes, and the dearest to run. The first time someone asks for it, he objects.
  const haunt = () => {
    spooked.current = true;
    inputRef.current?.blur();
    if (reduced) {
      setSpook("peek");
      later(3400, () => {
        setLength(BACK_TO);
        setSpook("off");
      });
      return;
    }
    setSpook("fall");
    later(450, () => setSpook("grip"));
    later(1250, () => setSpook("peek"));
    later(3300, () => {
      setSpook("drag");
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / 1700);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        setLength(Math.round((MAX_DURATION_S + (BACK_TO - MAX_DURATION_S) * e) * 2) / 2);
        if (k < 1) requestAnimationFrame(step);
        else
          later(1100, () => {
            setSpook("off");
            inputRef.current?.focus({ preventScroll: true });
          });
      };
      requestAnimationFrame(step);
    });
  };
  const { seconds: need, clause } = requiredHold(length);
  const short = Math.round(length * 10) / 10 <= 15;
  const shownNeed = useSpring(need, 0.08);
  const holdShare = useSpring(need / (MAX_DURATION_S - MIN_S), 0.08);
  const p = (length - MIN_S) / (MAX_DURATION_S - MIN_S);

  let pose: TickPose = { mood: length >= MAX_DURATION_S ? "worry" : short ? "pass" : "count", lcd: formatHold(need).replace("s", "") };
  let say: string | undefined = relented ? "Fine. Ninety seconds. Somewhere, a developer is crying." : undefined;
  if (spook === "fall" || spook === "grip" || spook === "peek") pose = { mood: "spooky", lcd: "NO" };
  if (spook === "peek")
    say = reduced
      ? "Stop. That’s costly. Let’s stay at three seconds, for the developer’s peace of mind."
      : "Stop. That’s costly.";
  if (spook === "drag") {
    pose = { mood: "spooky", lcd: formatHold(need).replace("s", ""), walking: true };
    say = "Let’s stay at three seconds, for the developer’s peace of mind.";
  }

  return (
    <section
      id="rule"
      className="lp-rule"
      data-state={short ? "short" : "long"}
      data-spook={spook === "off" ? undefined : spook}
      aria-labelledby="rule-title"
    >
      <div className="lp-rule__copy">
        <h2 id="rule-title" className="lp-h-m">
          The rule for{" "}
          <span key={short ? "short" : "long"} className="lp-swap">
            {short ? "short" : "long"}
          </span>{" "}
          Reels
        </h2>
        <p className="lp-rule__clause">
          <span className="lp-rule__code">{clause.code}</span> {clause.text}
        </p>
      </div>

      <div
        className="lp-dial"
        data-ui
        style={{ "--p": p.toFixed(4), "--hold": holdShare.toFixed(4), "--lean": lean } as React.CSSProperties}
      >
        <p className="lp-dial__readout">
          Label must stay <strong>{formatHold(Math.abs(shownNeed - need) < 0.005 ? need : shownNeed)}</strong> in one
          stretch
        </p>
        <p className="lp-dial__readout lp-dial__readout--len">
          <label htmlFor={id}>Video length</label> <strong>{formatSeconds(length)}</strong>
        </p>
        <div className="lp-dial__track">
          <span className="lp-dial__video" aria-hidden="true" />
          <span className="lp-dial__hold" aria-hidden="true" />
          <span className="lp-dial__tick" aria-hidden="true">
            <Tick size={144} outlined say={say} {...pose} />
          </span>
          <svg className="lp-dial__hands" viewBox="0 0 6 11" aria-hidden="true">
            {[0, 7].flatMap((top) =>
              HAND.flatMap((row, y) =>
                [...row].map((bit, x) => (bit === "1" ? <rect key={`${top}-${x}-${y}`} x={x} y={top + y} width={1} height={1} /> : null)),
              ),
            )}
          </svg>
          <input
            ref={inputRef}
            id={id}
            type="range"
            disabled={spook !== "off"}
            min={MIN_S}
            max={MAX_DURATION_S}
            step={0.5}
            value={length}
            onChange={(e) => {
              const next = Number(e.target.value);
              setLean(Math.sign(next - length));
              setLength(next);
              window.clearTimeout(leanTimer.current);
              leanTimer.current = window.setTimeout(() => setLean(0), 180);
              // Only he objects, and after six he has gone home.
              if (next >= MAX_DURATION_S && length < MAX_DURATION_S && document.documentElement.dataset.tickle !== "home") {
                if (!spooked.current) haunt();
                else {
                  // The second time, he lets them have it.
                  setRelented(true);
                  later(3600, () => setRelented(false));
                }
              }
            }}
            aria-valuetext={`${formatSeconds(length)} video: the label must stay ${formatHold(need)} in one stretch`}
            className="lp-dial__input"
          />
        </div>
        <p className="sr-only" aria-live="polite">
          {say ?? ""}
        </p>
        <ol className="lp-dial__scale" aria-hidden="true">
          {SCALE.map((s) => (
            <li key={s} style={{ "--at": ((s - MIN_S) / (MAX_DURATION_S - MIN_S)).toFixed(4) } as React.CSSProperties}>
              {s}s
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// The playhead's time lives outside React: the video sets it once per frame and the canvas, the playhead and the
// timecode read it directly. Anything in React asks for a coarse copy with useTimeStep.

export interface Clock {
  t: number;
  set: (t: number) => void;
  on: (listener: (t: number) => void) => () => void;
}

export function createClock(): Clock {
  const listeners = new Set<(t: number) => void>();
  const clock: Clock = {
    t: 0,
    set(t) {
      clock.t = t;
      listeners.forEach((listener) => listener(t));
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return clock;
}

/** The playhead's time, rounded down to a step, so a component re-renders that often and no more. */
export function useTimeStep(clock: Clock, step: number): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const read = (now: number) => setT(Math.floor(now / step) * step);
    read(clock.t);
    return clock.on(read);
  }, [clock, step]);
  return t;
}

const subscribeSecond = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};

const noSubscribe = () => () => {};

/** Whole seconds since an ISO time, ticking; null until the browser takes over, so server and browser agree. */
export function useElapsed(since: string | null | undefined): number | null {
  const now = useSyncExternalStore(
    since ? subscribeSecond : noSubscribe,
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );
  if (!since || !now) return null;
  return Math.max(0, now - Math.floor(Date.parse(since) / 1000));
}

export const elapsedText = (seconds: number | null) => (seconds === null ? "" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`);

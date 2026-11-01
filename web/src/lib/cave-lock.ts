import { untilIstMidnight } from "./ist";

// One run through Tickle's dimension a day. However it ends, the way in stays shut until midnight IST; after a loss
// he takes the zipper with him. ?cave=again clears it (for testing, and for filming).

const KEY = "lp-cave-lock";
export type CaveOutcome = "won" | "caught" | "hesitated";
export interface CaveLock {
  until: number;
  outcome: CaveOutcome;
  seconds: number;
}

let cleared = false;

export function readLock(now = Date.now()): CaveLock | null {
  try {
    // Once per page load, so the run it allows still locks afterwards.
    if (!cleared && /[?&]cave=again(&|$)/.test(location.search)) {
      cleared = true;
      localStorage.removeItem(KEY);
      return null;
    }
    const lock = JSON.parse(localStorage.getItem(KEY) ?? "null") as CaveLock | null;
    if (!lock || typeof lock.until !== "number" || lock.until <= now) return null;
    return lock;
  } catch {
    return null;
  }
}

export function writeLock(outcome: CaveOutcome, seconds: number, now = Date.now()): CaveLock {
  const lock = { until: now + untilIstMidnight(now), outcome, seconds };
  try {
    localStorage.setItem(KEY, JSON.stringify(lock));
  } catch {
    // storage blocked: the lock lasts for this page view
  }
  return lock;
}

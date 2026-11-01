// Mr Tickle keeps office hours in India: 09:00 to 18:00 IST, Monday to Friday. IST is UTC+05:30 all year.
// At work he is on the landing page; after hours he is at home, in the cave.
const IST_OFFSET_MS = 330 * 60_000;
const SHIFT_START = 9 * 3600_000;
const SHIFT_END = 18 * 3600_000;
const DAY = 24 * 3600_000;

/** The wall clock in India for an instant, read through the UTC getters. */
function istWall(now: number) {
  const wall = new Date(now + IST_OFFSET_MS);
  const intoDay = now + IST_OFFSET_MS - Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return { day: wall.getUTCDay(), intoDay };
}

/** While he is at work, the milliseconds until his shift ends; null when he is home. */
export function shiftRemaining(now: number): number | null {
  const { day, intoDay } = istWall(now);
  if (day === 0 || day === 6) return null;
  if (intoDay < SHIFT_START || intoDay >= SHIFT_END) return null;
  return SHIFT_END - intoDay;
}

/** From `now`, the milliseconds until his next shift starts: 09:00 IST on the next working day. */
export function untilNextShift(now: number): number {
  const { day, intoDay } = istWall(now);
  let dayStart = now - intoDay;
  let weekday = day;
  for (let i = 0; i < 8; i++) {
    const start = dayStart + SHIFT_START;
    if (weekday >= 1 && weekday <= 5 && start > now) return start - now;
    dayStart += DAY;
    weekday = (weekday + 1) % 7;
  }
  return 0;
}

/** 18:00 IST on the day `now` falls in, in the visitor's own clock, e.g. "6:00 pm" or "18:00". */
export function shiftEndLocal(now: number, locale?: string): string {
  const { intoDay } = istWall(now);
  return new Date(now - intoDay + SHIFT_END).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** hh:mm:ss, rounded up so the last second shows 00:00:01, not 00:00:00. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** The time in India as hh:mm. */
export function istClock(now: number): string {
  const { intoDay } = istWall(now);
  const minutes = Math.floor(intoDay / 60_000);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Milliseconds until the next 18:00 IST: today's, or tomorrow's once it has passed. */
export function untilSix(now: number): number {
  const { intoDay } = istWall(now);
  return ((SHIFT_END - intoDay + DAY - 1) % DAY) + 1;
}

/** Where Mr Tickle is: "work" during his shift, else "home". `?tickle=work` or `?tickle=home` overrides it, for demos. */
export function whereIsTickle(now: number, search = ""): "work" | "home" {
  const forced = /[?&]tickle=(work|home)(&|$)/.exec(search)?.[1];
  if (forced === "work" || forced === "home") return forced;
  return shiftRemaining(now) === null ? "home" : "work";
}

/** Milliseconds until the next midnight in India: when the cave lets you back in. */
export function untilIstMidnight(now: number): number {
  const { intoDay } = istWall(now);
  return DAY - intoDay;
}

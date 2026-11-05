// The landing page's colour follows the visitor's clock. Pure: time to daypart, daypart to palette. The server picks
// from the x-vercel-ip-* headers (app/page.tsx); without them the browser picks before first paint.

export const DAYPARTS = ["dawn", "morning", "afternoon", "dusk", "night"] as const;
export type Daypart = (typeof DAYPARTS)[number];

export interface Palette {
  ground: "light" | "dark";
  paper: string;
  step: string;
  stepSoft: string;
  stepHover: string;
  ink: string;
  soft: string;
  card: string;
  border: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentSurface: string;
  sheet: string;
  sheetInk: string;
  sheetSoft: string;
  band: string;
}

/** Morning is the house palette. Text on the accent is always --ink-950, like every primary button. */
export const PALETTES: Record<Daypart, Palette> = {
  dawn: {
    ground: "light",
    paper: "#f9f0ea",
    step: "#ecdcd2",
    stepSoft: "#f4e7df",
    stepHover: "#dfcabd",
    ink: "#20171c",
    soft: "#66565b",
    card: "#fdf8f4",
    border: "#dcc9be",
    accent: "#e9552b",
    accentHover: "#f26f47",
    accentText: "#a5321a",
    accentSurface: "#fbe0d6",
    sheet: "#2b1d2b",
    sheetInk: "#f9f0ea",
    sheetSoft: "#bcaab5",
    band: "#2b1d2b",
  },
  morning: {
    ground: "light",
    paper: "#fbfaf6",
    step: "#e8e5dc",
    stepSoft: "#f3f1ea",
    stepHover: "#c9c5ba",
    ink: "#121212",
    soft: "#5f5d57",
    card: "#fbfaf6",
    border: "#c9c5ba",
    accent: "#ea4e12",
    accentHover: "#f0703a",
    accentText: "#a9360a",
    accentSurface: "#fbe2d5",
    sheet: "#121212",
    sheetInk: "#f3f1ea",
    sheetSoft: "#9a978f",
    band: "#121212",
  },
  afternoon: {
    ground: "light",
    paper: "#f8f4e4",
    step: "#eae3cb",
    stepSoft: "#f3edd9",
    stepHover: "#dcd3b4",
    ink: "#16140a",
    soft: "#5b5743",
    card: "#fcf9ee",
    border: "#d6cfb3",
    accent: "#ee5b0f",
    accentHover: "#f6762f",
    accentText: "#993a06",
    accentSurface: "#fbe7c9",
    sheet: "#1b1a0f",
    sheetInk: "#f8f4e4",
    sheetSoft: "#aaa68e",
    band: "#1b1a0f",
  },
  dusk: {
    ground: "dark",
    paper: "#1d1626",
    step: "#2f253b",
    stepSoft: "#251c30",
    stepHover: "#40344e",
    ink: "#f7ede3",
    soft: "#bbaebb",
    card: "#211929",
    border: "#4b3f59",
    accent: "#f0703a",
    accentHover: "#f68a5b",
    accentText: "#ff9d6c",
    accentSurface: "#3b211f",
    sheet: "#30243e",
    sheetInk: "#f7ede3",
    sheetSoft: "#c2b6c2",
    band: "#3b3048",
  },
  night: {
    ground: "dark",
    paper: "#0d0f13",
    step: "#1b1f27",
    stepSoft: "#14171d",
    stepHover: "#2a2f3a",
    ink: "#eef0f0",
    soft: "#a2a7ae",
    card: "#12141a",
    border: "#2d323c",
    accent: "#ea4e12",
    accentHover: "#f0703a",
    accentText: "#f59a6e",
    accentSurface: "#33190d",
    sheet: "#1a1d25",
    sheetInk: "#eef0f0",
    sheetSoft: "#a8adb4",
    band: "#252a34",
  },
};

/** The local hour each daypart starts at, in order. Before the first start it is still night. */
const STARTS: [number, Daypart][] = [
  [5, "dawn"],
  [8, "morning"],
  [12, "afternoon"],
  [17, "dusk"],
  [20, "night"],
];

export function daypartAt(hour: number): Daypart {
  let part: Daypart = "night";
  for (const [start, name] of STARTS) if (hour >= start) part = name;
  return part;
}

/** The palette as the --dp-* variables landing.css reads, e.g. stepSoft becomes --dp-step-soft. */
export function paletteVars(part: Daypart): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(PALETTES[part])) {
    if (key !== "ground") vars[`--dp-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
  }
  return vars;
}

/** Repaints the landing root in place. Inline style, like the first paint, so React has nothing to fight. */
export function paintDaypart(root: HTMLElement, part: Daypart) {
  if (root.dataset.daypart === part) return;
  for (const [name, value] of Object.entries(paletteVars(part))) root.style.setProperty(name, value);
  root.dataset.daypart = part;
  root.dataset.ground = PALETTES[part].ground;
}

/**
 * For a request with no timezone header (local dev, or a host that isn't Vercel): set first thing inside the landing
 * root so the browser's own clock picks the palette before anything paints. Holds only constants, never request data.
 */
export function clockFallbackScript(): string {
  const paints = Object.fromEntries(DAYPARTS.map((part) => [part, { g: PALETTES[part].ground, v: paletteVars(part) }]));
  return `(function(){var r=document.currentScript.parentElement,h=new Date().getHours(),p="night",P=${JSON.stringify(paints)};${JSON.stringify(STARTS)}.forEach(function(s){if(h>=s[0])p=s[1]});for(var k in P[p].v)r.style.setProperty(k,P[p].v[k]);r.dataset.daypart=p;r.dataset.ground=P[p].g})();`;
}

/** A real IANA zone name, or null. The value comes from a header or the URL, so it isn't trusted. */
export function validZone(zone: unknown): string | null {
  if (typeof zone !== "string" || !zone) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The wall clock in a zone: its hour, and hh:mm on 24 hours. */
export function zonedTime(now: number, zone: string): { hour: number; clock: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const read = (type: "hour" | "minute") => parts.find((part) => part.type === type)?.value ?? "00";
  return { hour: Number(read("hour")), clock: `${read("hour")}:${read("minute")}` };
}

// Countries that read wrong after "from" without "the".
const WITH_THE = new Set(["AE", "BS", "CD", "CF", "CG", "DO", "GB", "GM", "KY", "MV", "NL", "PH", "SC", "US"]);

/** "IN" to "India", "US" to "the US". Null for anything that isn't a two-letter region the browser can name. */
export function countryName(code: unknown): string | null {
  if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code)) return null;
  const name = new Intl.DisplayNames(["en"], { type: "region", style: "short", fallback: "none" }).of(code);
  if (!name || name.startsWith("Unknown")) return null;
  return WITH_THE.has(code) ? `the ${name}` : name;
}

const WORDS: Record<Daypart, string> = {
  dawn: "Good morning",
  morning: "Good morning",
  afternoon: "Good afternoon",
  dusk: "Good evening",
  night: "Good evening",
};

export function greeting(part: Daypart, hour: number, clock: string, country: string | null): string {
  if (part === "night" && hour < 5) return `Up late${country ? ` in ${country}` : ""}, ${clock}`;
  return `${WORDS[part]}${country ? ` from ${country}` : ""}, ${clock}`;
}

export interface LocalClock {
  zone: string | null;
  country: string | null;
  forced: Daypart | null;
  part: Daypart;
  line: string | null;
}

export function clockAt(now: number, zone: string, country: string | null, forced: Daypart | null): { part: Daypart; line: string } {
  const { hour, clock } = zonedTime(now, zone);
  const part = forced ?? daypartAt(hour);
  return { part, line: greeting(part, hour, clock, country) };
}

type Query = Record<string, string | string[] | undefined>;

/**
 * What the server knows about the visitor's clock. ?daypart= and ?tz= override it for testing; ?country= goes with ?tz=,
 * since the header's country would be wrong for an overridden zone.
 */
export function readClock(headers: { tz: string | null; country: string | null }, query: Query, now = Date.now()): LocalClock {
  const askedZone = validZone(query.tz);
  const zone = askedZone ?? validZone(headers.tz);
  const country = countryName(query.country) ?? (askedZone ? null : countryName(headers.country));
  const forced = DAYPARTS.find((part) => part === query.daypart) ?? null;
  if (!zone) return { zone, country, forced, part: forced ?? "morning", line: null };
  return { zone, country, forced, ...clockAt(now, zone, country, forced) };
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2 contrast ratio of two #rrggbb colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

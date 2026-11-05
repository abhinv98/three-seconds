import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clockAt,
  clockFallbackScript,
  contrast,
  countryName,
  DAYPARTS,
  daypartAt,
  greeting,
  paletteVars,
  PALETTES,
  readClock,
  validZone,
  zonedTime,
} from "./daypart";

const INK_950 = "#121212";
const CREAM = "#fbf7ec";
const NOON_UTC = Date.UTC(2026, 10, 5, 12, 0);
const noHeaders = { tz: null, country: null };

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });
  it("doesn't care about the order", () => {
    expect(contrast("#ea4e12", INK_950)).toBe(contrast(INK_950, "#ea4e12"));
  });
});

describe.each(DAYPARTS)("the %s palette keeps AA", (part) => {
  const p = PALETTES[part];
  const text: [string, string, string][] = [
    ["ink on paper", p.ink, p.paper],
    ["ink on step", p.ink, p.step],
    ["ink on the soft step", p.ink, p.stepSoft],
    ["ink on card", p.ink, p.card],
    ["ink on the accent surface", p.ink, p.accentSurface],
    ["soft on paper", p.soft, p.paper],
    ["soft on step", p.soft, p.step],
    ["soft on the soft step", p.soft, p.stepSoft],
    ["soft on card", p.soft, p.card],
    ["accent text on paper", p.accentText, p.paper],
    ["accent text on card", p.accentText, p.card],
    ["button ink on the accent", INK_950, p.accent],
    ["button ink on the hovered accent", INK_950, p.accentHover],
    ["sheet ink on sheet", p.sheetInk, p.sheet],
    ["sheet soft on sheet", p.sheetSoft, p.sheet],
    ["paper on ink, the reversed tooltip and tab", p.paper, p.ink],
  ];
  it.each(text)("%s", (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("the accent stands off the ground and the sheet as a control", () => {
    expect(contrast(p.accent, p.paper)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.accent, p.sheet)).toBeGreaterThanOrEqual(3);
  });
  it("the cream button keeps its ink", () => {
    expect(contrast(INK_950, CREAM)).toBeGreaterThanOrEqual(4.5);
  });
  it("dark grounds are dark, light grounds are light", () => {
    const darkest = p.ground === "dark" ? p.paper : p.ink;
    const lightest = p.ground === "dark" ? p.ink : p.paper;
    expect(contrast(darkest, "#000000")).toBeLessThan(contrast(lightest, "#000000"));
  });
});

describe("daypartAt", () => {
  it.each([
    [0, "night"],
    [4, "night"],
    [5, "dawn"],
    [7, "dawn"],
    [8, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "dusk"],
    [19, "dusk"],
    [20, "night"],
    [23, "night"],
  ])("%i:00 is %s", (hour, part) => {
    expect(daypartAt(hour)).toBe(part);
  });
});

describe("paletteVars", () => {
  it("names every colour and leaves the ground out", () => {
    const vars = paletteVars("dusk");
    expect(vars["--dp-paper"]).toBe(PALETTES.dusk.paper);
    expect(vars["--dp-step-soft"]).toBe(PALETTES.dusk.stepSoft);
    expect(vars["--dp-accent-surface"]).toBe(PALETTES.dusk.accentSurface);
    expect(vars["--dp-ground"]).toBeUndefined();
  });
});

describe("validZone", () => {
  it("takes real zones and nothing else", () => {
    expect(validZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(validZone("Mars/Olympus")).toBeNull();
    expect(validZone("")).toBeNull();
    expect(validZone(["Asia/Tokyo"])).toBeNull();
    expect(validZone(undefined)).toBeNull();
  });
});

describe("zonedTime", () => {
  it("reads half-hour zones", () => {
    expect(zonedTime(NOON_UTC, "Asia/Kolkata")).toEqual({ hour: 17, clock: "17:30" });
  });
  it("calls midnight 00, not 24", () => {
    expect(zonedTime(Date.UTC(2026, 10, 5, 15, 5), "Asia/Tokyo")).toEqual({ hour: 0, clock: "00:05" });
  });
});

describe("countryName", () => {
  it("names a region, with the where it needs one", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("JP")).toBe("Japan");
    expect(countryName("US")).toBe("the US");
  });
  it("gives nothing for a code it can't trust", () => {
    expect(countryName("XX")).toBeNull();
    expect(countryName("india")).toBeNull();
    expect(countryName("<b>")).toBeNull();
    expect(countryName(null)).toBeNull();
  });
});

describe("greeting", () => {
  it("reads as the owner wrote it", () => {
    expect(greeting("dusk", 19, "19:42", "India")).toBe("Good evening from India, 19:42");
  });
  it("drops the country when there isn't one", () => {
    expect(greeting("morning", 9, "09:05", null)).toBe("Good morning, 09:05");
  });
  it("doesn't say good evening at two in the morning", () => {
    expect(greeting("night", 2, "02:10", "India")).toBe("Up late in India, 02:10");
    expect(greeting("night", 2, "02:10", null)).toBe("Up late, 02:10");
    expect(greeting("night", 22, "22:10", "India")).toBe("Good evening from India, 22:10");
  });
});

describe("clockAt", () => {
  it("picks the daypart from the zone's clock", () => {
    expect(clockAt(NOON_UTC, "Asia/Kolkata", "India", null)).toEqual({ part: "dusk", line: "Good evening from India, 17:30" });
  });
  it("lets a forced daypart set the colour and the word, with the real time", () => {
    expect(clockAt(NOON_UTC, "Asia/Kolkata", null, "morning")).toEqual({ part: "morning", line: "Good morning, 17:30" });
  });
});

describe("readClock", () => {
  it("uses the Vercel headers", () => {
    const clock = readClock({ tz: "Asia/Kolkata", country: "IN" }, {}, NOON_UTC);
    expect(clock).toMatchObject({ zone: "Asia/Kolkata", country: "India", forced: null, part: "dusk", line: "Good evening from India, 17:30" });
  });
  it("leaves the time to the browser with no header", () => {
    expect(readClock(noHeaders, {}, NOON_UTC)).toEqual({ zone: null, country: null, forced: null, part: "morning", line: null });
  });
  it("ignores a bad header", () => {
    expect(readClock({ tz: "not/a zone", country: "IN" }, {}, NOON_UTC)).toMatchObject({ zone: null, line: null });
  });
  it("takes ?tz= over the header and drops the header's country", () => {
    const clock = readClock({ tz: "Asia/Kolkata", country: "IN" }, { tz: "Asia/Tokyo" }, NOON_UTC);
    expect(clock).toMatchObject({ zone: "Asia/Tokyo", country: null, part: "night", line: "Good evening, 21:00" });
  });
  it("takes ?country= with ?tz=", () => {
    expect(readClock(noHeaders, { tz: "Asia/Tokyo", country: "JP" }, NOON_UTC).line).toBe("Good evening from Japan, 21:00");
  });
  it("takes ?daypart= and ignores a made-up one", () => {
    expect(readClock({ tz: "Asia/Kolkata", country: "IN" }, { daypart: "dawn" }, NOON_UTC).part).toBe("dawn");
    expect(readClock(noHeaders, { daypart: "dawn" }, NOON_UTC)).toMatchObject({ forced: "dawn", part: "dawn", line: null });
    expect(readClock({ tz: "Asia/Kolkata", country: "IN" }, { daypart: "brunch" }, NOON_UTC).forced).toBeNull();
    expect(readClock({ tz: "Asia/Kolkata", country: "IN" }, { daypart: ["dawn", "dusk"] }, NOON_UTC).forced).toBeNull();
  });
});

describe("clockFallbackScript", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const run = (localHour: number) => {
    vi.useFakeTimers({ now: new Date(2026, 10, 5, localHour, 30) });
    const style = new Map<string, string>();
    const root = { style: { setProperty: (k: string, v: string) => style.set(k, v) }, dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { currentScript: { parentElement: root } });
    new Function(clockFallbackScript())();
    return { dataset: root.dataset, style };
  };
  it.each(DAYPARTS.map((part, i) => [part, [6, 9, 14, 18, 22][i]] as const))("paints %s from the browser's clock", (part, hour) => {
    const { dataset, style } = run(hour);
    expect(dataset).toEqual({ daypart: part, ground: PALETTES[part].ground });
    expect(Object.fromEntries(style)).toEqual(paletteVars(part));
  });
  it("is night before dawn", () => {
    expect(run(3).dataset.daypart).toBe("night");
  });
});

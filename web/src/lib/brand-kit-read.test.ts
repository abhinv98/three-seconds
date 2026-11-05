import { beforeEach, expect, test, vi } from "vitest";

// What a read saves, and what the brand folder is told while it waits. The database and the web are stood in for.
const rows = vi.hoisted(() => ({ row: null as unknown, writes: [] as { sql: string; args: unknown[] }[] }));
const research = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: { execute: async () => ({ rowsAffected: 1 }) },
  get: async () => rows.row,
  run: async (sql: string, ...args: unknown[]) => void rows.writes.push({ sql, args }),
}));
vi.mock("@/lib/site-hints", () => ({ readSiteHints: async () => ({ icons: ["https://a.test/i.svg"], socialImage: null, logoColors: [], colors: [{ hex: "#0082fb", uses: 3 }], fonts: ["Inter"], themeColor: null, description: "" }) }));
vi.mock("@/lib/brand-research", () => ({ researchBrand: research }));
vi.mock("@/lib/safe-fetch", () => ({ safeFetch: async () => ({ body: Buffer.from('<svg viewBox="0 0 1 1"/>'), contentType: "image/svg+xml" }) }));
vi.spyOn(console, "error").mockImplementation(() => {});

const { buildBrandKit, kitProgress } = await import("./brand-kit");
const BRAND = { id: "b1", name: "Acme", website: "https://www.acme.in" };
const RESEARCH = { name: "Acme", tagline: "t", summary: "s", logo_url: "", colors: [{ hex: "#ff0000", name: "Red" }], fonts: [], products: [], market: "m", market_sources: [], mentions: [] };

const saved = (word: string) => rows.writes.filter((w) => w.sql.includes(word));

beforeEach(() => {
  rows.row = null;
  rows.writes = [];
  research.mockReset();
});

test("a read reports each step once and saves the kit", async () => {
  research.mockImplementation(async (_n, _w, _h, onStep) => {
    onStep('Searching the web for "acme"');
    onStep('Searching the web for "acme"');
    onStep("Opening acme.in");
    return { research: RESEARCH, costUsd: 0.3, searches: 1 };
  });
  await buildBrandKit(BRAND);
  const last = saved("progress").at(-1)!;
  const steps = JSON.parse(last.args[0] as string) as { text: string; colors?: string[] }[];
  expect(steps.map((s) => s.text)).toEqual([
    "Reading acme.in's homepage: its icons, theme colour and stylesheets",
    "On the homepage: 1 icon, 1 colours, 1 typeface",
    'Searching the web for "acme"',
    "Opening acme.in",
    "Fetching the logo and checking the type",
  ]);
  expect(steps[1].colors).toEqual(["#0082fb"]);
  const kit = JSON.parse(saved("'done'")[0].args[0] as string);
  expect(kit.summary).toBe("s");
  expect(kit.logo).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(kit.site).toBe("acme.in");
});

test("an error from the SDK isn't shown as it is, and one of ours is", async () => {
  research.mockRejectedValueOnce(new Error("Credentials file not found at /Users/someone/.config/anthropic"));
  await buildBrandKit(BRAND);
  expect(saved("'error'")[0].args[0]).toBe("The web research stopped before it finished. Try again.");
  rows.writes = [];
  research.mockRejectedValueOnce(new Error("Claude declined the request."));
  await buildBrandKit(BRAND);
  expect(saved("'error'")[0].args[0]).toBe("Claude declined the request.");
});

test("progress: nothing yet, a live read, and a read that died", async () => {
  expect(await kitProgress("b1")).toBeNull();
  rows.row = { status: "reading", started_at: new Date().toISOString(), progress: JSON.stringify([{ s: 1, text: "x" }]), error: null };
  expect(await kitProgress("b1")).toMatchObject({ status: "reading", steps: [{ s: 1, text: "x" }], error: null });
  rows.row = { status: "reading", started_at: new Date(Date.now() - 8 * 60_000).toISOString(), progress: null, error: null };
  expect(await kitProgress("b1")).toMatchObject({ status: "error", steps: [], error: "The read stopped before it finished." });
});

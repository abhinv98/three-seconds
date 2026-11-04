import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const OWN_URL = "https://own.public.blob.vercel-storage.com/videos/reel-abc.mp4";

vi.mock("@vercel/blob", () => ({
  head: async (url: string) => {
    if (url !== OWN_URL) throw new Error("not in this store");
    return { url: OWN_URL, pathname: "videos/reel-abc.mp4", contentType: "video/mp4", size: 1024 };
  },
}));

// A database of its own: db.ts opens its file on import.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "analyze-test-"));
delete process.env.TURSO_DATABASE_URL;
const { POST } = await import("./route");
const { db } = await import("@/lib/db");

const worker = vi.fn<typeof fetch>(async () => Response.json({ job_id: "job" }));
vi.stubGlobal("fetch", worker);

const analyze = (blobUrl = OWN_URL) =>
  POST(new Request("http://site.test/api/analyze", { method: "POST", body: JSON.stringify({ blobUrl, filename: "reel.mp4" }) }));

beforeEach(async () => {
  await db.execute("DROP TABLE IF EXISTS analyze_day");
  vi.stubEnv("WORKER_URL", "http://worker.test");
  vi.stubEnv("ANALYZE_ENABLED", "");
  vi.stubEnv("ANALYZE_DAILY_CAP", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  worker.mockClear();
});

test("a URL outside our store never reaches the worker and doesn't use up a check", async () => {
  vi.stubEnv("ANALYZE_DAILY_CAP", "1");
  for (const url of ["https://other.public.blob.vercel-storage.com/videos/x.mp4", "https://example.com/x.mp4"]) {
    expect((await analyze(url)).status).toBe(400);
  }
  expect(worker).not.toHaveBeenCalled();

  expect((await analyze()).status).toBe(200);
  expect(JSON.parse(worker.mock.calls[0][1]?.body as string).blob_url).toBe(OWN_URL);
});

test("the daily cap holds when requests race, and says why", async () => {
  vi.stubEnv("ANALYZE_DAILY_CAP", "2");
  const responses = await Promise.all(Array.from({ length: 5 }, () => analyze()));
  expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 429, 429, 429]);
  expect(worker).toHaveBeenCalledTimes(2);
  const blocked = responses.find((r) => r.status === 429)!;
  expect((await blocked.json()).error).toMatch(/used up.*midnight IST/);
});

test("the cap defaults to 25, and a bad value falls back to that", async () => {
  vi.stubEnv("ANALYZE_DAILY_CAP", "lots");
  const responses = await Promise.all(Array.from({ length: 27 }, () => analyze()));
  expect(responses.filter((r) => r.status === 200)).toHaveLength(25);
  expect(worker).toHaveBeenCalledTimes(25);
});

test("a cap of 0 stops every check", async () => {
  vi.stubEnv("ANALYZE_DAILY_CAP", "0");
  expect((await analyze()).status).toBe(429);
  expect(worker).not.toHaveBeenCalled();
});

test("the count is per day in India, so yesterday's checks don't carry over", async () => {
  vi.stubEnv("ANALYZE_DAILY_CAP", "1");
  await analyze();
  expect((await analyze()).status).toBe(429);
  const { rows } = await db.execute("SELECT day, count FROM analyze_day");
  expect({ ...rows[0] }).toEqual({ day: new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10), count: 1 });

  await db.execute("UPDATE analyze_day SET day = '2000-01-01'");
  expect((await analyze()).status).toBe(200);
});

test.each(["false", "0", "off", "FALSE "])("ANALYZE_ENABLED=%j stops checks", async (flag) => {
  vi.stubEnv("ANALYZE_ENABLED", flag);
  const response = await analyze();
  expect(response.status).toBe(503);
  expect((await response.json()).error).toMatch(/switched off/);
  expect(worker).not.toHaveBeenCalled();
});

test.each(["", "true", "1", " True "])("ANALYZE_ENABLED=%j allows checks", async (flag) => {
  vi.stubEnv("ANALYZE_ENABLED", flag);
  expect((await analyze()).status).toBe(200);
});

test("mock mode spends nothing, so a tab's blob: URL still gets its sample report", async () => {
  vi.stubEnv("WORKER_URL", "");
  vi.stubEnv("ANALYZE_DAILY_CAP", "0");
  const response = await analyze("blob:http://localhost:3000/abc");
  expect(response.status).toBe(200);
  expect((await response.json()).video.blob_url).toBe("blob:http://localhost:3000/abc");
  expect(worker).not.toHaveBeenCalled();
});

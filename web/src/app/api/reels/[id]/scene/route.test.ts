import { beforeEach, describe, expect, it, vi } from "vitest";

const getViewer = vi.fn();
const reelFor = vi.fn();
const job = vi.fn();

vi.mock("@/lib/account", () => ({ getViewer, reelFor }));
vi.mock("@/lib/scene-job", () => ({ reelScenes: { get: job } }));

const { GET } = await import("./route");
const call = (query = "") => GET(new Request(`http://x/api/reels/r1/scene${query}`), { params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue({ profile: {} });
  reelFor.mockResolvedValue({ id: "r1" });
});

describe("GET /api/reels/[id]/scene", () => {
  it("wants a signed-in member", async () => {
    getViewer.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getViewer.mockResolvedValue({ profile: null });
    expect((await call()).status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("hides a Reel the viewer can't see", async () => {
    reelFor.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(job).not.toHaveBeenCalled();
  });

  it("sends a finished scene with a long private cache", async () => {
    job.mockResolvedValue({ status: "done", data: { version: 1 }, error: null, started_at: "t" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=604800, immutable");
    expect(await response.json()).toEqual({ version: 1 });
  });

  it("says how a scene that isn't finished stands, and never caches that", async () => {
    job.mockResolvedValue({ status: "reading", data: null, error: null, started_at: "2026-11-05T00:00:00Z" });
    let response = await call();
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ status: "reading", started_at: "2026-11-05T00:00:00Z", error: null });

    job.mockResolvedValue({ status: "error", data: null, error: "It stopped.", started_at: "t" });
    response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("It stopped.");

    job.mockResolvedValue(null);
    response = await call();
    expect(response.status).toBe(404);
    expect((await response.json()).status).toBe("none");
  });

  it("a share token opens nothing: the public page has no use for the tracking data", async () => {
    getViewer.mockResolvedValue(null);
    expect((await call("?share=good")).status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });
});

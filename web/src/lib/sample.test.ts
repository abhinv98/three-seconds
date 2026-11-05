import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

// A database of its own: db.ts opens its file on import.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "sample-test-"));
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
delete process.env.TURSO_DATABASE_URL;

type Viewer = { user: { id: string; name: string; email: string }; profile: object | null; brand: { id: string; name: string; website: string } | null };
let viewer: Viewer;

const after = vi.fn();
const buildFinerDetails = vi.fn(async () => {});
const buildBrandKit = vi.fn(async () => {});
const buildScene = vi.fn(async () => {});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after }));
vi.mock("@/lib/account", async (original) => ({
  ...(await original<typeof import("@/lib/account")>()),
  getViewer: async () => viewer,
  requireMember: async () => viewer,
}));
vi.mock("@/lib/finer", async (original) => ({ ...(await original<typeof import("@/lib/finer")>()), buildFinerDetails }));
vi.mock("@/lib/brand-kit", async (original) => ({ ...(await original<typeof import("@/lib/brand-kit")>()), buildBrandKit }));
vi.mock("@/lib/scene-job", async (original) => ({ ...(await original<typeof import("@/lib/scene-job")>()), buildScene }));

const { schemaReady } = await import("@/lib/auth");
const { db, get, run } = await import("@/lib/db");
const { isSampleViewer, requireWritable, requireWritableBrand, SAMPLE, SAMPLE_READ_ONLY } = await import("@/lib/sample");
const { sendReelAction, inviteBrandAction, readBrandKitAction, finerDetailsAction } = await import("@/app/dashboard/actions");
const { finishOnboarding } = await import("@/app/onboarding/actions");
const { POST: reels } = await import("@/app/api/reels/route");
const { POST: upload } = await import("@/app/api/upload/route");

const KIT = { name: "Meta", site: "meta.com", tagline: "", logo: null, colors: [], fonts: [], web_fonts: [], products: [], market: "", market_sources: [], mentions: [], read_at: "2026-11-05" };
const NOW = "2026-11-05T00:00:00.000Z";
const SAMPLE_ID = "sample-user";
const OTHER_ID = "other-user";
const SAMPLE_BRAND = { id: "sample-brand", name: "Meta", website: "https://meta.com" };
const sample: Viewer = { user: { id: SAMPLE_ID, name: SAMPLE.name, email: SAMPLE.email }, profile: { role: "brand" }, brand: SAMPLE_BRAND };
const other: Viewer = { user: { id: OTHER_ID, name: "Asha", email: "asha@example.com" }, profile: { role: "creator" }, brand: null };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
// The table doesn't exist until the first claim.
const count = async (kind: string) => (await get<{ count: number }>("SELECT count FROM spend_day WHERE kind = ?", kind).catch(() => null))?.count ?? 0;
const seal = () => run("INSERT INTO reel_details (reel_id, status, details, started_at) VALUES ('seed', 'done', '{}', ?)", NOW);
const addReel = (id: string, owner: string, brand: string | null) =>
  run("INSERT INTO reel (id, owner_id, brand_id, filename, size_bytes, status, report, created_at, video_url) VALUES (?, ?, ?, 'r.mp4', 1, 'done', '{}', ?, 'https://x/v.mp4')", id, owner, brand, NOW);
const toDetails = (id: string) => ({ url: expect.stringMatching(new RegExp(`^/dashboard/reels/${id}/details\\?read=\\d+$`)) });

beforeAll(() => schemaReady());

beforeEach(async () => {
  for (const table of ["reel_details", "reel_scene", "brand_kit", "connection", "reel", "brand", "profile", '"user"']) await db.execute(`DELETE FROM ${table}`);
  await db.execute("DROP TABLE IF EXISTS spend_day");
  for (const { user } of [sample, other]) {
    await run(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`, user.id, user.name, user.email, NOW, NOW);
  }
  await run("INSERT INTO profile (user_id, role, display_name, created_at) VALUES (?, 'brand', 'Metty', ?), (?, 'creator', 'Asha', ?)", SAMPLE_ID, NOW, OTHER_ID, NOW);
  await run("INSERT INTO brand (id, owner_id, name, website, invite_code, created_at) VALUES (?, ?, 'Meta', 'https://meta.com', 'code', ?)", SAMPLE_BRAND.id, SAMPLE_ID, NOW);
  await run("INSERT INTO brand_kit (brand_id, status, kit, started_at) VALUES (?, 'done', ?, ?)", SAMPLE_BRAND.id, JSON.stringify(KIT), NOW);
  await addReel("seed", SAMPLE_ID, SAMPLE_BRAND.id);
  viewer = sample;
});

afterEach(() => {
  vi.unstubAllEnvs();
  after.mockClear();
});

test("the sample is known by its email, whatever the case", () => {
  expect(isSampleViewer(sample)).toBe(true);
  expect(isSampleViewer({ user: { email: SAMPLE.email.toUpperCase() } })).toBe(true);
  expect(isSampleViewer(other)).toBe(false);
});

test("the sample stays writable while it's seeded, and seals on its first finished read", async () => {
  expect(await requireWritable(sample)).toBeNull();
  await run("INSERT INTO reel_details (reel_id, status, started_at) VALUES ('seed', 'reading', ?)", NOW);
  expect(await requireWritable(sample)).toBeNull();
  await run("UPDATE reel_details SET status = 'error' WHERE reel_id = 'seed'");
  expect(await requireWritable(sample)).toBeNull();
  await run("UPDATE reel_details SET status = 'done' WHERE reel_id = 'seed'");
  expect(await requireWritable(sample)).toBe(SAMPLE_READ_ONLY);
  expect(await requireWritableBrand(SAMPLE_BRAND.id)).toBe(SAMPLE_READ_ONLY);
});

test("a Reel a creator sent the sample's folder seals it too", async () => {
  await db.execute("DELETE FROM reel");
  await addReel("sent", OTHER_ID, SAMPLE_BRAND.id);
  await run("INSERT INTO reel_details (reel_id, status, details, started_at) VALUES ('sent', 'done', '{}', ?)", NOW);
  expect(await requireWritable(sample)).toBe(SAMPLE_READ_ONLY);
});

test("nobody else is ever read-only, finished reads or not", async () => {
  await addReel("theirs", OTHER_ID, null);
  await run("INSERT INTO reel_details (reel_id, status, details, started_at) VALUES ('theirs', 'done', '{}', ?)", NOW);
  expect(await requireWritable(other)).toBeNull();
  expect(await requireWritableBrand("no-such-brand")).toBeNull();
});

test("a sealed sample can't do anything that writes or spends", async () => {
  await seal();
  await addReel("second", SAMPLE_ID, SAMPLE_BRAND.id);
  const message = encodeURIComponent(SAMPLE_READ_ONLY);

  await expect(sendReelAction(form({ reelId: "second", brandId: SAMPLE_BRAND.id }))).rejects.toMatchObject({ url: `/dashboard/reels/second?error=${message}` });
  expect(await inviteBrandAction(null, form({ brandName: "Acme" }))).toEqual({ error: SAMPLE_READ_ONLY });
  await expect(readBrandKitAction()).rejects.toMatchObject({ url: `/dashboard?error=${message}` });
  await expect(finerDetailsAction(form({ reelId: "second" }))).rejects.toMatchObject({ url: `/dashboard/reels/second?error=${message}` });
  viewer = { ...sample, profile: null };
  expect(await finishOnboarding(null, form({ role: "creator" }))).toEqual({ error: SAMPLE_READ_ONLY });
  viewer = sample;

  const reel = await reels(new Request("http://site.test/api/reels", { method: "POST", body: JSON.stringify({ url: "https://x/v.mp4", filename: "r.mp4" }) }));
  expect(reel.status).toBe(403);
  expect((await reel.json()).error).toBe(SAMPLE_READ_ONLY);
  const blob = await upload(new Request("http://site.test/api/upload", { method: "POST", body: "{}" }));
  expect(blob.status).toBe(403);
  expect((await blob.json()).error).toBe(SAMPLE_READ_ONLY);

  expect(after).not.toHaveBeenCalled();
  expect(await get("SELECT 1 FROM reel_details WHERE reel_id = 'second'")).toBeNull();
  expect((await get<{ n: number }>("SELECT COUNT(*) AS n FROM reel"))?.n).toBe(2);
  expect((await get<{ sent_at: string | null }>("SELECT sent_at FROM reel WHERE id = 'second'"))?.sent_at).toBeNull();
  expect((await get<{ n: number }>("SELECT COUNT(*) AS n FROM connection"))?.n).toBe(0);
  expect((await get<{ status: string }>("SELECT status FROM brand_kit WHERE brand_id = ?", SAMPLE_BRAND.id))?.status).toBe("done");
  expect(await count("finer")).toBe(0);
  expect(await count("brand_kit")).toBe(0);
});

test("nobody can send a Reel into a sealed sample's folder", async () => {
  await seal();
  await addReel("mine", OTHER_ID, null);
  await run("INSERT INTO connection (id, creator_id, brand_id, brand_name, created_at) VALUES ('c1', ?, ?, 'Meta', ?)", OTHER_ID, SAMPLE_BRAND.id, NOW);
  viewer = other;
  await expect(sendReelAction(form({ reelId: "mine", brandId: SAMPLE_BRAND.id }))).rejects.toMatchObject({ url: `/dashboard/reels/mine?error=${encodeURIComponent(SAMPLE_READ_ONLY)}` });
  expect((await get<{ brand_id: string | null }>("SELECT brand_id FROM reel WHERE id = 'mine'"))?.brand_id).toBeNull();
});

test("a creator with a Reel in the sealed folder can't restart its read, which would unseal the sample", async () => {
  await db.execute("DELETE FROM reel");
  await addReel("sent", OTHER_ID, SAMPLE_BRAND.id);
  await run("INSERT INTO reel_details (reel_id, status, details, started_at) VALUES ('sent', 'done', '{}', ?)", NOW);
  viewer = other;
  await expect(finerDetailsAction(form({ reelId: "sent" }))).rejects.toMatchObject({ url: `/dashboard/reels/sent?error=${encodeURIComponent(SAMPLE_READ_ONLY)}` });
  expect(after).not.toHaveBeenCalled();
  expect((await get<{ status: string }>("SELECT status FROM reel_details WHERE reel_id = 'sent'"))?.status).toBe("done");
  expect(await get("SELECT 1 FROM reel_scene WHERE reel_id = 'sent'")).toBeNull();
  expect(await count("finer")).toBe(0);
  expect(await requireWritable(sample)).toBe(SAMPLE_READ_ONLY);
});

test("a sealed sample changes nothing for a normal brand and its creator", async () => {
  await seal();
  const OWN_BRAND = { id: "own-brand", name: "Acme", website: "https://acme.in" };
  await run(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('owner', 'Ravi', 'ravi@acme.in', 0, ?, ?)`, NOW, NOW);
  await run("INSERT INTO profile (user_id, role, display_name, created_at) VALUES ('owner', 'brand', 'Ravi', ?)", NOW);
  await run("INSERT INTO brand (id, owner_id, name, website, invite_code, created_at) VALUES (?, 'owner', 'Acme', 'https://acme.in', 'acme-code', ?)", OWN_BRAND.id, NOW);
  await run("INSERT INTO brand_kit (brand_id, status, kit, started_at) VALUES (?, 'done', ?, ?)", OWN_BRAND.id, JSON.stringify(KIT), NOW);
  await addReel("acme-reel", "owner", OWN_BRAND.id);
  await addReel("mine", OTHER_ID, null);
  await run("INSERT INTO connection (id, creator_id, brand_id, brand_name, created_at) VALUES ('c2', ?, ?, 'Acme', ?)", OTHER_ID, OWN_BRAND.id, NOW);

  viewer = { user: { id: "owner", name: "Ravi", email: "ravi@acme.in" }, profile: { role: "brand" }, brand: OWN_BRAND };
  await expect(finerDetailsAction(form({ reelId: "acme-reel" }))).rejects.toMatchObject(toDetails("acme-reel"));
  await readBrandKitAction();
  expect(after).toHaveBeenCalledTimes(3);

  viewer = other;
  expect(await inviteBrandAction(null, form({ brandName: "Globex" }))).toHaveProperty("token");
  await expect(sendReelAction(form({ reelId: "mine", brandId: OWN_BRAND.id }))).rejects.toMatchObject({ url: "/dashboard/reels/mine?sent=1" });
  expect((await get<{ brand_id: string }>("SELECT brand_id FROM reel WHERE id = 'mine'"))?.brand_id).toBe(OWN_BRAND.id);
});

test("a read that ends between the look and the claim can't start another without a count or past the kill switch", async () => {
  vi.stubEnv("ANALYZE_ENABLED", "false");
  const { finerDetails } = await import("@/lib/finer");
  const { brandKits } = await import("@/lib/brand-kit");
  const { reelScenes } = await import("@/lib/scene-job");
  const running = { status: "reading" as const, data: null, error: null, cost_usd: null, started_at: NOW };
  await run("INSERT INTO reel_details (reel_id, status, started_at) VALUES ('seed', 'error', ?)", NOW);
  await reelScenes.claim("seed");
  const finerLook = vi.spyOn(finerDetails, "get").mockResolvedValueOnce(running);
  await expect(finerDetailsAction(form({ reelId: "seed" }))).rejects.toMatchObject(toDetails("seed"));
  finerLook.mockRestore();
  const kitLook = vi.spyOn(brandKits, "get").mockResolvedValueOnce(running as never);
  await readBrandKitAction();
  kitLook.mockRestore();

  expect(after).not.toHaveBeenCalled();
  expect((await get<{ status: string }>("SELECT status FROM reel_details WHERE reel_id = 'seed'"))?.status).toBe("error");
  expect((await get<{ status: string }>("SELECT status FROM brand_kit WHERE brand_id = ?", SAMPLE_BRAND.id))?.status).toBe("done");
});

test("before it's sealed the sample seeds through the same actions", async () => {
  await addReel("second", SAMPLE_ID, SAMPLE_BRAND.id);
  await expect(finerDetailsAction(form({ reelId: "second" }))).rejects.toMatchObject(toDetails("second"));
  expect(after).toHaveBeenCalledTimes(2);
  expect((await get<{ status: string }>("SELECT status FROM reel_details WHERE reel_id = 'second'"))?.status).toBe("reading");
  await readBrandKitAction();
  expect(after).toHaveBeenCalledTimes(3);
});

test("the scene starts beside the finer read in its own after, and a finished one isn't run again", async () => {
  await addReel("second", SAMPLE_ID, SAMPLE_BRAND.id);
  const press = () => expect(finerDetailsAction(form({ reelId: "second" }))).rejects.toMatchObject(toDetails("second"));
  const sceneStatus = async () => (await get<{ status: string }>("SELECT status FROM reel_scene WHERE reel_id = 'second'"))?.status;

  await press();
  expect(after).toHaveBeenCalledTimes(2);
  expect(await sceneStatus()).toBe("reading");

  await run("UPDATE reel_details SET status = 'error' WHERE reel_id = 'second'");
  await run("UPDATE reel_scene SET status = 'done', scene = '{}' WHERE reel_id = 'second'");
  await press();
  expect(after).toHaveBeenCalledTimes(3);
  expect(await sceneStatus()).toBe("done");

  // The read is running but the scene failed: this click starts one thing, and pays for it.
  await run("UPDATE reel_scene SET status = 'error' WHERE reel_id = 'second'");
  const before = await count("finer");
  await press();
  expect(after).toHaveBeenCalledTimes(4);
  expect(await sceneStatus()).toBe("reading");
  expect(await count("finer")).toBe(before + 1);

  const { reelScenes } = await import("@/lib/scene-job");
  await reelScenes.finish("second", { version: 1 } as never, 0.74);
  expect(await reelScenes.get("second")).toMatchObject({ status: "done", data: { version: 1 }, cost_usd: 0.74 });
});

test("retrying failed tracking leaves finished details alone, and with both finished a click starts nothing", async () => {
  const OWN_BRAND = { id: "own-brand", name: "Acme", website: "https://acme.in" };
  await run(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('owner', 'Ravi', 'ravi@acme.in', 0, ?, ?)`, NOW, NOW);
  await run("INSERT INTO profile (user_id, role, display_name, created_at) VALUES ('owner', 'brand', 'Ravi', ?)", NOW);
  await run("INSERT INTO brand (id, owner_id, name, website, invite_code, created_at) VALUES (?, 'owner', 'Acme', 'https://acme.in', 'acme-code', ?)", OWN_BRAND.id, NOW);
  await run("INSERT INTO brand_kit (brand_id, status, kit, started_at) VALUES (?, 'done', ?, ?)", OWN_BRAND.id, JSON.stringify(KIT), NOW);
  await addReel("acme-reel", "owner", OWN_BRAND.id);
  viewer = { user: { id: "owner", name: "Ravi", email: "ravi@acme.in" }, profile: { role: "brand" }, brand: OWN_BRAND };
  const press = () => expect(finerDetailsAction(form({ reelId: "acme-reel" }))).rejects.toMatchObject(toDetails("acme-reel"));
  const status = async (table: string) => (await get<{ status: string }>(`SELECT status FROM ${table} WHERE reel_id = 'acme-reel'`))?.status;
  await run("INSERT INTO reel_details (reel_id, status, details, started_at) VALUES ('acme-reel', 'done', '{}', ?)", NOW);
  await run("INSERT INTO reel_scene (reel_id, status, error, started_at) VALUES ('acme-reel', 'error', 'It stopped.', ?)", NOW);

  await press();
  expect(after).toHaveBeenCalledTimes(1);
  expect(await count("finer")).toBe(1);
  expect(await status("reel_details")).toBe("done");
  expect(await status("reel_scene")).toBe("reading");

  await run("UPDATE reel_scene SET status = 'done', scene = '{}' WHERE reel_id = 'acme-reel'");
  await press();
  expect(after).toHaveBeenCalledTimes(1);
  expect(await count("finer")).toBe(1);
});

test("a new kit read starts with an empty log, not the last read's steps", async () => {
  await run("UPDATE brand_kit SET progress = ? WHERE brand_id = ?", '[{"s":1,"text":"old"}]', SAMPLE_BRAND.id);
  await readBrandKitAction();
  expect((await get<{ progress: string | null }>("SELECT progress FROM brand_kit WHERE brand_id = ?", SAMPLE_BRAND.id))?.progress).toBeNull();
});

test("finer details stop at FINER_DAILY_CAP and say why, and a second click on a running read takes no count", async () => {
  vi.stubEnv("FINER_DAILY_CAP", "1");
  await addReel("second", SAMPLE_ID, SAMPLE_BRAND.id);
  const press = (reelId: string) => finerDetailsAction(form({ reelId }));

  await expect(press("seed")).rejects.toMatchObject(toDetails("seed"));
  await expect(press("seed")).rejects.toMatchObject(toDetails("seed"));
  expect(await count("finer")).toBe(1);
  expect(after).toHaveBeenCalledTimes(2);

  const refused = await press("second").catch((e: { url: string }) => decodeURIComponent(e.url));
  expect(refused).toMatch(/\/dashboard\/reels\/second\?error=Today's free finer details are used up\. .*midnight IST/);
  expect(after).toHaveBeenCalledTimes(2);
  expect(await get("SELECT 1 FROM reel_details WHERE reel_id = 'second'")).toBeNull();
  expect(await get("SELECT 1 FROM reel_scene WHERE reel_id = 'second'")).toBeNull();
});

test("a brand kit read stops at BRAND_KIT_DAILY_CAP and says why", async () => {
  vi.stubEnv("BRAND_KIT_DAILY_CAP", "1");
  await readBrandKitAction();
  expect(after).toHaveBeenCalledTimes(1);
  await readBrandKitAction();
  expect(await count("brand_kit")).toBe(1);

  await run("UPDATE brand_kit SET status = 'done'");
  const refused = await readBrandKitAction().catch((e: { url: string }) => decodeURIComponent(e.url));
  expect(refused).toMatch(/^\/dashboard\?error=Today's free brand kit reads are used up\. .*midnight IST/);
  expect(after).toHaveBeenCalledTimes(1);
});

test("the caps default to 10 and don't share a count", async () => {
  const { admitSpend } = await import("@/lib/check-reel");
  const racing = (kind: "finer" | "brand_kit") => Promise.all(Array.from({ length: 12 }, () => admitSpend(kind)));
  expect((await racing("finer")).filter((r) => r === null)).toHaveLength(10);
  expect((await racing("brand_kit")).filter((r) => r === null)).toHaveLength(10);
  expect(await count("analyze")).toBe(0);
});

test.each(["false", "0", "off"])("ANALYZE_ENABLED=%j stops finer details and brand kit reads too", async (flag) => {
  vi.stubEnv("ANALYZE_ENABLED", flag);
  const finer = await finerDetailsAction(form({ reelId: "seed" })).catch((e: { url: string }) => decodeURIComponent(e.url));
  expect(finer).toMatch(/Finer details are switched off/);
  const kit = await readBrandKitAction().catch((e: { url: string }) => decodeURIComponent(e.url));
  expect(kit).toMatch(/Brand kit reads are switched off/);
  expect(after).not.toHaveBeenCalled();
});

test.each([
  ["over the cap", "BRAND_KIT_DAILY_CAP", "0"],
  ["with the kill switch off", "ANALYZE_ENABLED", "false"],
])("%s, a new brand folder still gets made and its kit just doesn't start", async (_, name, value) => {
  vi.stubEnv(name, value);
  await run("DELETE FROM profile WHERE user_id = ?", OTHER_ID);
  viewer = { ...other, profile: null };
  await expect(finishOnboarding(null, form({ role: "brand", brandName: "Acme", website: "acme.in" }))).rejects.toMatchObject({ url: "/dashboard" });
  const made = await get<{ id: string }>("SELECT id FROM brand WHERE owner_id = ?", OTHER_ID);
  expect(made).not.toBeNull();
  expect(await get("SELECT 1 FROM brand_kit WHERE brand_id = ?", made!.id)).toBeNull();
  expect(after).not.toHaveBeenCalled();
});

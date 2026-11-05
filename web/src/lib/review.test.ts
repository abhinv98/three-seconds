import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A database of its own: db.ts opens its file on import. Everything here runs against real tables.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-test-"));
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
delete process.env.TURSO_DATABASE_URL;

type Viewer = { user: { id: string; name: string; email: string }; profile: { role: string; display_name: string } | null; brand: { id: string } | null };
let viewer: Viewer | null;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "three.test", "x-forwarded-proto": "https" }) }));
vi.mock("@/lib/account", async (original) => ({
  ...(await original<typeof import("@/lib/account")>()),
  getViewer: async () => viewer,
  requireMember: async () => viewer,
}));

const { schemaReady } = await import("@/lib/auth");
const { db, get, run } = await import("@/lib/db");
const review = await import("@/lib/review");
const actions = await import("@/app/dashboard/review-actions");
const { SAMPLE, SAMPLE_READ_ONLY } = await import("@/lib/sample");
const video = await import("@/app/api/reels/[id]/video/route");
const scene = await import("@/app/api/reels/[id]/scene/route");

const NOW = "2026-11-05T00:00:00.000Z";
const person = (id: string, role: string, brand: string | null, email = `${id}@example.com`): Viewer => ({
  user: { id, name: id, email },
  profile: { role, display_name: `${id} name` },
  brand: brand ? { id: brand } : null,
});
const brand = person("brandowner", "brand", "b1");
const otherBrand = person("otherowner", "brand", "b2");
const creator = person("creator", "creator", null);
const stranger = person("stranger", "creator", null);
const sample = person("sampleuser", "brand", "b3", SAMPLE.email);

const REPORT = JSON.stringify({ video: { duration_s: 30 } });
const VIDEO = "https://blob.test/secret.mp4";

async function addUser(id: string, email: string) {
  await run(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`, id, id, email, NOW, NOW);
  await run("INSERT INTO profile (user_id, role, display_name, created_at) VALUES (?, 'brand', ?, ?)", id, `${id} name`, NOW);
}

const addReel = (id: string, owner: string, brandId: string | null, sent: boolean, status = "done") =>
  run(
    "INSERT INTO reel (id, owner_id, brand_id, filename, size_bytes, status, report, sent_at, created_at, video_url) VALUES (?, ?, ?, 'a.mp4', 1, ?, ?, ?, ?, ?)",
    id,
    owner,
    brandId,
    status,
    REPORT,
    sent ? NOW : null,
    NOW,
    VIDEO,
  );

const asViewer = (who: Viewer | null) => {
  viewer = who;
};
const tokenOf = async (reelId: string) => {
  const result = await actions.createShareLinkAction(reelId);
  if ("error" in result) throw new Error(result.error);
  return result.url.split("/").pop() as string;
};
const videoFor = (id: string, query = "") => video.GET(new Request(`http://x/api/reels/${id}/video${query}`), { params: Promise.resolve({ id }) });
const sceneFor = (id: string, query = "") => scene.GET(new Request(`http://x/api/reels/${id}/scene${query}`), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  await schemaReady();
  for (const [id, email] of [
    ["brandowner", "brandowner@example.com"],
    ["otherowner", "otherowner@example.com"],
    ["creator", "creator@example.com"],
    ["stranger", "stranger@example.com"],
    ["sampleuser", SAMPLE.email],
  ]) {
    await addUser(id, email);
  }
  for (const [id, owner] of [
    ["b1", "brandowner"],
    ["b2", "otherowner"],
    ["b3", "sampleuser"],
  ]) {
    await run("INSERT INTO brand (id, owner_id, name, website, invite_code, created_at) VALUES (?, ?, ?, 'https://a.test', ?, ?)", id, owner, `${id} name`, `code-${id}`, NOW);
  }
});

beforeEach(async () => {
  for (const table of ["reel_details", "reel_scene", "reel_review", "reel_note", "reel_moment_done", "reel_share", "reel_caption", "reel"]) await db.execute(`DELETE FROM ${table}`);
  await addReel("sent", "creator", "b1", true);
  await addReel("own", "brandowner", "b1", false);
  await addReel("unsent", "creator", null, false);
  await addReel("running", "brandowner", "b1", false, "checking");
});

describe("reviewReelAction", () => {
  it("the brand that owns the folder approves, and a new answer replaces the last", async () => {
    asViewer(brand);
    expect(await actions.reviewReelAction("sent", "approved", "")).toEqual({ ok: true });
    expect(await review.reviewFor("sent")).toEqual({ status: "approved", note: null, by_name: "brandowner name", at: expect.any(String) });
    expect(await actions.reviewReelAction("sent", "changes", " Show the label longer. ")).toEqual({ ok: true });
    expect(await review.reviewFor("sent")).toMatchObject({ status: "changes", note: "Show the label longer." });
  });

  it("the creator sees the answer but can't give one", async () => {
    asViewer(brand);
    await actions.reviewReelAction("sent", "changes", "Show the label longer.");
    asViewer(creator);
    expect(await actions.reviewReelAction("sent", "approved", "")).toEqual({ error: expect.stringContaining("Only the brand") });
    expect(await review.reviewFor("sent")).toMatchObject({ status: "changes", note: "Show the label longer." });
  });

  it("another brand, or a stranger, gets the same answer as for a Reel that isn't there", async () => {
    const missing = await (asViewer(stranger), actions.reviewReelAction("nothing", "approved", ""));
    expect("error" in missing).toBe(true);
    for (const who of [otherBrand, stranger]) {
      asViewer(who);
      expect(await actions.reviewReelAction("sent", "approved", "")).toEqual(missing);
    }
    expect(await review.reviewFor("sent")).toBeNull();
  });

  it("asking for changes takes a note; a junk status and an unfinished check are refused", async () => {
    asViewer(brand);
    expect(await actions.reviewReelAction("sent", "changes", "   ")).toEqual({ error: "Say what should change." });
    expect("error" in (await actions.reviewReelAction("sent", "nope" as "approved", ""))).toBe(true);
    expect("error" in (await actions.reviewReelAction("running", "approved", ""))).toBe(true);
    expect(await review.reviewFor("sent")).toBeNull();
  });

  it("reviewsFor returns a map, and nothing for no ids", async () => {
    asViewer(brand);
    await actions.reviewReelAction("sent", "approved", "");
    expect((await review.reviewsFor([])).size).toBe(0);
    const map = await review.reviewsFor(["sent", "own"]);
    expect([...map.keys()]).toEqual(["sent"]);
    expect(map.get("sent")?.status).toBe("approved");
  });
});

describe("notes", () => {
  it("both sides add them, ordered by time and clamped to the Reel", async () => {
    asViewer(brand);
    expect(await actions.addNoteAction("sent", 12.5, "Too dark")).toEqual({ ok: true });
    asViewer(creator);
    expect(await actions.addNoteAction("sent", 3, "Will reshoot")).toEqual({ ok: true });
    expect(await actions.addNoteAction("sent", 500, "Past the end")).toEqual({ ok: true });
    const notes = await review.notesFor("sent");
    expect(notes.map((n) => [n.t, n.text, n.by_name])).toEqual([
      [3, "Will reshoot", "creator name"],
      [12.5, "Too dark", "brandowner name"],
      [30, "Past the end", "creator name"],
    ]);
    expect(Object.keys(notes[0]).sort()).toEqual(["at", "by_name", "id", "reel_id", "t", "text"]);
  });

  it("refuses an empty note, a bad time and someone who can't see the Reel", async () => {
    asViewer(creator);
    expect(await actions.addNoteAction("sent", 1, "  ")).toEqual({ error: "Write the note first." });
    for (const t of [Number.NaN, Infinity, -1]) expect(await actions.addNoteAction("sent", t, "x")).toEqual({ error: "That time isn't on the Reel." });
    asViewer(stranger);
    expect("error" in (await actions.addNoteAction("sent", 1, "x"))).toBe(true);
    expect(await review.notesFor("sent")).toEqual([]);
  });

  it("the author or the folder's brand deletes one; nobody else does", async () => {
    asViewer(creator);
    await actions.addNoteAction("sent", 1, "Mine");
    asViewer(brand);
    await actions.addNoteAction("sent", 2, "The brand's");
    const [mine, theirs] = await review.notesFor("sent");

    asViewer(creator);
    expect("error" in (await actions.deleteNoteAction("sent", theirs.id))).toBe(true);
    expect(await actions.deleteNoteAction("sent", mine.id)).toEqual({ ok: true });
    asViewer(creator);
    await actions.addNoteAction("sent", 3, "Mine again");
    const again = (await review.notesFor("sent")).find((n) => n.text === "Mine again");
    asViewer(brand);
    expect(await actions.deleteNoteAction("sent", again?.id ?? "")).toEqual({ ok: true });
    expect(await actions.deleteNoteAction("sent", again?.id ?? "")).toEqual({ error: "That note is already gone." });
  });

  it("can't delete another Reel's note through this one", async () => {
    asViewer(brand);
    await actions.addNoteAction("sent", 1, "On sent");
    const [note] = await review.notesFor("sent");
    expect(await actions.deleteNoteAction("own", note.id)).toEqual({ error: "That note is already gone." });
    expect(await review.notesFor("sent")).toHaveLength(1);
  });
});

describe("moments done and captions", () => {
  it("a moment goes done and back", async () => {
    asViewer(creator);
    expect(await actions.setMomentDoneAction("sent", "m1", true)).toEqual({ ok: true });
    expect(await actions.setMomentDoneAction("sent", "m1", true)).toEqual({ ok: true });
    expect(await review.doneMoments("sent")).toEqual(["m1"]);
    expect(await actions.setMomentDoneAction("sent", "m1", false)).toEqual({ ok: true });
    expect(await review.doneMoments("sent")).toEqual([]);
    asViewer(stranger);
    expect("error" in (await actions.setMomentDoneAction("sent", "m1", true))).toBe(true);
  });

  it("a caption saves, and saves over itself", async () => {
    asViewer(creator);
    expect(await review.captionFor("sent")).toBeNull();
    expect(await actions.saveCaptionAction("sent", " Ad. Hiking era ", true)).toEqual({ ok: true });
    expect(await review.captionFor("sent")).toEqual({ caption: "Ad. Hiking era", usesPlatformTag: true, by_name: "creator name", at: expect.any(String) });
    expect(await actions.saveCaptionAction("sent", "x".repeat(3000), false)).toEqual({ ok: true });
    expect(await review.captionFor("sent")).toMatchObject({ caption: "x".repeat(2200), usesPlatformTag: false });
    asViewer(stranger);
    expect("error" in (await actions.saveCaptionAction("sent", "x", false))).toBe(true);
  });
});

describe("the public sample", () => {
  beforeEach(async () => {
    await addReel("sampled", "sampleuser", "b3", false);
    await run("INSERT INTO reel_details (reel_id, status, started_at) VALUES ('sampled', 'done', ?)", NOW);
  });

  it("every write is refused once it's sealed, and reads still work", async () => {
    asViewer(sample);
    for (const result of [
      await actions.reviewReelAction("sampled", "approved", ""),
      await actions.addNoteAction("sampled", 1, "x"),
      await actions.deleteNoteAction("sampled", "n"),
      await actions.setMomentDoneAction("sampled", "m1", true),
      await actions.createShareLinkAction("sampled"),
      await actions.revokeShareLinkAction("sampled"),
      await actions.saveCaptionAction("sampled", "x", true),
    ]) {
      expect(result).toEqual({ error: SAMPLE_READ_ONLY });
    }
    expect(await review.reviewFor("sampled")).toBeNull();
  });

  it("a creator who sent a Reel into the sealed folder can't write on it either", async () => {
    await addReel("into-sample", "creator", "b3", true);
    asViewer(creator);
    expect(await actions.addNoteAction("into-sample", 1, "x")).toEqual({ error: SAMPLE_READ_ONLY });
  });
});

describe("share links", () => {
  it("makes a 144-bit token on this site's origin, and the same link until it's revoked", async () => {
    asViewer(brand);
    const first = await actions.createShareLinkAction("sent");
    expect(first).toEqual({ url: expect.stringMatching(/^https:\/\/three\.test\/share\/[\w-]{24}$/) });
    expect(await actions.createShareLinkAction("sent")).toEqual(first);
    const token = (first as { url: string }).url.split("/").pop() as string;
    expect(Buffer.from(token, "base64url")).toHaveLength(18);
    expect(await review.shareTokenFor("sent")).toBe(token);
    expect(await review.reelIdForShare(token)).toBe("sent");
    expect(await actions.revokeShareLinkAction("sent")).toEqual({ ok: true });
    const second = await actions.createShareLinkAction("sent");
    expect((second as { url: string }).url).not.toBe((first as { url: string }).url);
  });

  it("only someone who can see the Reel makes or revokes one, and only for a finished check", async () => {
    asViewer(stranger);
    expect("error" in (await actions.createShareLinkAction("sent"))).toBe(true);
    asViewer(brand);
    expect("error" in (await actions.createShareLinkAction("running"))).toBe(true);
    expect("error" in (await actions.createShareLinkAction("unsent"))).toBe(true);
    await tokenOf("sent");
    asViewer(stranger);
    expect("error" in (await actions.revokeShareLinkAction("sent"))).toBe(true);
    expect(await review.shareTokenFor("sent")).not.toBeNull();
    asViewer(creator);
    expect(await actions.revokeShareLinkAction("sent")).toEqual({ ok: true });
    expect(await review.shareTokenFor("sent")).toBeNull();
  });

  it("the current link is null until there is one, and only for someone who can see the Reel", async () => {
    asViewer(brand);
    expect(await actions.currentShareLinkAction("sent")).toEqual({ url: null });
    const made = await actions.createShareLinkAction("sent");
    expect(await actions.currentShareLinkAction("sent")).toEqual(made);
    asViewer(stranger);
    expect(await actions.currentShareLinkAction("sent")).toEqual({ url: null });
  });

  it("ignores anything that isn't shaped like a token, without touching the database", async () => {
    for (const token of ["", "short", "x".repeat(25), "' OR 1=1 --xxxxxxxxxxxxxx", "a/b/c/d/e/f/g/h/i/j/k/l/m"]) {
      expect(await review.reelIdForShare(token)).toBeNull();
    }
  });
});

describe("video and scene routes with ?share=", () => {
  it("video: a valid token opens its Reel with no account and no cache", async () => {
    asViewer(brand);
    const token = await tokenOf("sent");
    asViewer(null);
    const response = await videoFor("sent", `?share=${token}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(VIDEO);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("video: no token and no account is 401, and a wrong token is 404, signed in or not", async () => {
    asViewer(brand);
    const token = await tokenOf("sent");
    asViewer(null);
    expect((await videoFor("sent")).status).toBe(401);
    expect((await videoFor("own", `?share=${token}`)).status).toBe(404);
    expect((await videoFor("sent", "?share=nope")).status).toBe(404);
    expect((await videoFor("sent", "?share=")).status).toBe(404);
    expect((await videoFor("sent", `?share=${"a".repeat(24)}`)).status).toBe(404);
    asViewer(brand);
    expect((await videoFor("sent", "?share=nope")).status).toBe(404);
    expect((await videoFor("sent")).status).toBe(302);
  });

  it("scene: a token opens only its own Reel", async () => {
    asViewer(brand);
    const token = await tokenOf("sent");
    await run("INSERT INTO reel_scene (reel_id, status, scene, started_at) VALUES ('sent', 'done', ?, ?)", JSON.stringify({ version: 1 }), new Date().toISOString());
    await run("INSERT INTO reel_scene (reel_id, status, scene, started_at) VALUES ('own', 'done', ?, ?)", JSON.stringify({ version: 2 }), new Date().toISOString());
    asViewer(null);
    const allowed = await sceneFor("sent", `?share=${token}`);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ version: 1 });
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    expect((await sceneFor("own", `?share=${token}`)).status).toBe(404);
    expect((await sceneFor("sent")).status).toBe(401);
  });

  it("a revoked token stops working on the very next request", async () => {
    asViewer(brand);
    const token = await tokenOf("sent");
    await run("INSERT INTO reel_scene (reel_id, status, scene, started_at) VALUES ('sent', 'done', '{}', ?)", new Date().toISOString());
    asViewer(null);
    expect((await videoFor("sent", `?share=${token}`)).status).toBe(302);
    expect((await sceneFor("sent", `?share=${token}`)).status).toBe(200);
    asViewer(brand);
    await actions.revokeShareLinkAction("sent");
    asViewer(null);
    expect((await videoFor("sent", `?share=${token}`)).status).toBe(404);
    expect((await sceneFor("sent", `?share=${token}`)).status).toBe(404);
    expect(await review.reelIdForShare(token)).toBeNull();
    expect(await get("SELECT 1 FROM reel_share WHERE token = ?", token)).toBeNull();
  });

  it("deleting a Reel takes its link with it", async () => {
    asViewer(brand);
    const token = await tokenOf("sent");
    await db.execute("PRAGMA foreign_keys = ON");
    await run("DELETE FROM reel WHERE id = 'sent'");
    expect(await review.reelIdForShare(token)).toBeNull();
  });
});

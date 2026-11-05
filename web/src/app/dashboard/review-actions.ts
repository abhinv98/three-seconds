"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { reelFor, requireMember, siteOrigin, type Member } from "@/lib/account";
import { CAPTION_LIMIT } from "@/lib/caption";
import { get, run } from "@/lib/db";
import { shareTokenFor, type ReviewStatus } from "@/lib/review";
import { requireWritable, requireWritableBrand } from "@/lib/sample";

// reelFor decides who may touch a Reel. Past that: only the brand that owns the folder answers on it, and a note is
// deleted by its author or by that brand. Arguments come off the network, so they are checked here too.

export type ActionResult = { ok: true } | { error: string };

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

type Reel = NonNullable<Awaited<ReturnType<typeof reelFor>>>;

async function open(reelId: string): Promise<{ viewer: Member; reel: Reel } | { error: string }> {
  const viewer = await requireMember(`/dashboard/reels/${encodeURIComponent(reelId)}`);
  const readOnly = await requireWritable(viewer);
  if (readOnly) return { error: readOnly };
  const reel = await reelFor(viewer, String(reelId));
  if (!reel) return { error: "That Reel isn't here, or isn't yours to change." };
  // A creator who sent a Reel into the sample's folder isn't the sample, but the folder is still sealed.
  const sealed = reel.brand_id ? await requireWritableBrand(reel.brand_id) : null;
  if (sealed) return { error: sealed };
  return { viewer, reel };
}

const ownsFolder = (viewer: Member, reel: { brand_id: string | null }) => viewer.brand !== null && reel.brand_id === viewer.brand.id;

const refresh = () => revalidatePath("/dashboard", "layout");

export async function reviewReelAction(reelId: string, status: ReviewStatus, note: string): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const { viewer, reel } = opened;
  if (!ownsFolder(viewer, reel)) return { error: "Only the brand that owns this folder can approve a Reel or ask for changes." };
  if (status !== "approved" && status !== "changes") return { error: "That isn't an answer on a Reel." };
  if (reel.status !== "done") return { error: "Wait for the check to finish first." };
  const text = clean(note, 1000);
  if (status === "changes" && !text) return { error: "Say what should change." };
  await run(
    `INSERT INTO reel_review (reel_id, status, note, by_name, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (reel_id) DO UPDATE SET status = excluded.status, note = excluded.note, by_name = excluded.by_name, at = excluded.at`,
    reel.id,
    status,
    text || null,
    viewer.profile.display_name,
    new Date().toISOString(),
  );
  refresh();
  return { ok: true };
}

export async function addNoteAction(reelId: string, t: number, text: string): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const { viewer, reel } = opened;
  const body = clean(text, 500);
  if (!body) return { error: "Write the note first." };
  const at = Number(t);
  if (!Number.isFinite(at) || at < 0) return { error: "That time isn't on the Reel." };
  const duration = reel.report?.video.duration_s;
  await run(
    "INSERT INTO reel_note (id, reel_id, author_id, t, text, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    randomUUID(),
    reel.id,
    viewer.user.id,
    duration ? Math.min(at, duration) : at,
    body,
    viewer.profile.display_name,
    new Date().toISOString(),
  );
  refresh();
  return { ok: true };
}

export async function deleteNoteAction(reelId: string, noteId: string): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const { viewer, reel } = opened;
  const note = await get<{ author_id: string }>("SELECT author_id FROM reel_note WHERE id = ? AND reel_id = ?", String(noteId), reel.id);
  if (!note) return { error: "That note is already gone." };
  if (note.author_id !== viewer.user.id && !ownsFolder(viewer, reel)) return { error: "Only the person who wrote a note, or the brand, can delete it." };
  await run("DELETE FROM reel_note WHERE id = ?", String(noteId));
  refresh();
  return { ok: true };
}

/** No page refresh: the Studio keeps this state itself, and refreshing would send the whole details prop again per click. */
export async function setMomentDoneAction(reelId: string, momentId: string, done: boolean): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const id = clean(momentId, 64);
  if (!id) return { error: "That change isn't on this Reel." };
  if (done) {
    await run("INSERT INTO reel_moment_done (reel_id, moment_id, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", opened.reel.id, id, new Date().toISOString());
  } else {
    await run("DELETE FROM reel_moment_done WHERE reel_id = ? AND moment_id = ?", opened.reel.id, id);
  }
  return { ok: true };
}

/** The link as it stands, for the panel that shows it. A read, so the sample may ask too. */
export async function currentShareLinkAction(reelId: string): Promise<{ url: string | null }> {
  const viewer = await requireMember(`/dashboard/reels/${encodeURIComponent(reelId)}`);
  const reel = await reelFor(viewer, String(reelId));
  const token = reel ? await shareTokenFor(reel.id) : null;
  return { url: token ? `${await siteOrigin()}/share/${token}` : null };
}

/** The Reel's one share link: the same link until it's revoked, a new one after. */
export async function createShareLinkAction(reelId: string): Promise<{ url: string } | { error: string }> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const { reel } = opened;
  if (reel.status !== "done") return { error: "Wait for the check to finish first." };
  await run(
    "INSERT INTO reel_share (reel_id, token, created_at) VALUES (?, ?, ?) ON CONFLICT (reel_id) DO NOTHING",
    reel.id,
    randomBytes(18).toString("base64url"),
    new Date().toISOString(),
  );
  refresh();
  return { url: `${await siteOrigin()}/share/${await shareTokenFor(reel.id)}` };
}

export async function revokeShareLinkAction(reelId: string): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  await run("DELETE FROM reel_share WHERE reel_id = ?", opened.reel.id);
  refresh();
  return { ok: true };
}

export async function saveCaptionAction(reelId: string, caption: string, usesPlatformTag: boolean): Promise<ActionResult> {
  const opened = await open(reelId);
  if ("error" in opened) return opened;
  const { viewer, reel } = opened;
  await run(
    `INSERT INTO reel_caption (reel_id, caption, uses_platform_tag, by_name, at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (reel_id) DO UPDATE SET caption = excluded.caption, uses_platform_tag = excluded.uses_platform_tag, by_name = excluded.by_name, at = excluded.at`,
    reel.id,
    clean(caption, CAPTION_LIMIT),
    usesPlatformTag === true ? 1 : 0,
    viewer.profile.display_name,
    new Date().toISOString(),
  );
  refresh();
  return { ok: true };
}

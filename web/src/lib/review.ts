import { schemaReady } from "@/lib/auth";
import { all, get } from "@/lib/db";

// What people say about a Reel once it's checked: the brand's answer, notes pinned to a time, moments marked done, the
// caption, and the public share link. Reads only; the writes and who may make them are in app/dashboard/review-actions.ts.
// Server only (db). Client components import the types.

export type ReviewStatus = "approved" | "changes";

export interface ReelReview {
  status: ReviewStatus;
  note: string | null;
  by_name: string;
  at: string;
}

export interface ReelNote {
  id: string;
  reel_id: string;
  t: number;
  text: string;
  by_name: string;
  at: string;
}

export interface ReelCaption {
  caption: string;
  usesPlatformTag: boolean;
  by_name: string;
  at: string;
}

export function reviewFor(reelId: string): Promise<ReelReview | null> {
  return get<ReelReview>("SELECT status, note, by_name, at FROM reel_review WHERE reel_id = ?", reelId);
}

export async function reviewsFor(reelIds: string[]): Promise<Map<string, ReelReview>> {
  if (!reelIds.length) return new Map();
  const rows = await all<ReelReview & { reel_id: string }>(
    `SELECT reel_id, status, note, by_name, at FROM reel_review WHERE reel_id IN (${reelIds.map(() => "?").join(",")})`,
    ...reelIds,
  );
  return new Map(rows.map(({ reel_id, ...review }) => [reel_id, review]));
}

export function notesFor(reelId: string): Promise<ReelNote[]> {
  return all<ReelNote>("SELECT id, reel_id, t, text, by_name, at FROM reel_note WHERE reel_id = ? ORDER BY t, at", reelId);
}

export async function doneMoments(reelId: string): Promise<string[]> {
  const rows = await all<{ moment_id: string }>("SELECT moment_id FROM reel_moment_done WHERE reel_id = ?", reelId);
  return rows.map((row) => row.moment_id);
}

export async function captionFor(reelId: string): Promise<ReelCaption | null> {
  const row = await get<{ caption: string; uses_platform_tag: number; by_name: string; at: string }>(
    "SELECT caption, uses_platform_tag, by_name, at FROM reel_caption WHERE reel_id = ?",
    reelId,
  );
  return row && { caption: row.caption, usesPlatformTag: Boolean(row.uses_platform_tag), by_name: row.by_name, at: row.at };
}

export async function shareTokenFor(reelId: string): Promise<string | null> {
  return (await get<{ token: string }>("SELECT token FROM reel_share WHERE reel_id = ?", reelId))?.token ?? null;
}

/** The Reel a share token opens. Never cached, so a revoked token stops working on the next request. */
export async function reelIdForShare(token: string): Promise<string | null> {
  if (!/^[\w-]{24}$/.test(token)) return null;
  // The share page and its routes may be the first thing a new server process is asked for.
  await schemaReady();
  return (await get<{ reel_id: string }>("SELECT reel_id FROM reel_share WHERE token = ?", token))?.reel_id ?? null;
}

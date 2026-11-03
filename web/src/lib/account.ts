import { randomBytes, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { InStatement } from "@libsql/client";
import { auth, schemaReady } from "@/lib/auth";
import { all, get, run, writeAll } from "@/lib/db";
import type { Report } from "@/lib/report";

// Accounts on top of Better Auth: a profile from the questionnaire (brand or creator), a brand folder for brands,
// connections between creators and the brands they make Reels for, and the Reels they check. Who may see what
// is decided here and nowhere else.

export type Role = "brand" | "creator";

export interface Profile {
  user_id: string;
  role: Role;
  display_name: string;
  handle: string | null;
  niche: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  owner_id: string;
  name: string;
  website: string;
  category: string | null;
  team_size: string | null;
  invite_code: string;
  created_at: string;
}

export interface Viewer {
  user: { id: string; name: string; email: string };
  profile: Profile | null;
  brand: Brand | null;
}
export type Member = Viewer & { profile: Profile };

const now = () => new Date().toISOString();
/** 24 url-safe characters, 144 bits: invite links can't be guessed. */
const newToken = () => randomBytes(18).toString("base64url");

export async function getViewer(): Promise<Viewer | null> {
  await schemaReady();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  const [profile, brand] = await Promise.all([
    get<Profile>("SELECT * FROM profile WHERE user_id = ?", id),
    get<Brand>("SELECT * FROM brand WHERE owner_id = ?", id),
  ]);
  return { user: { id, name, email }, profile, brand };
}

/** For pages behind sign-in: no session goes to /sign-in, no questionnaire yet to /onboarding; both come back. */
export async function requireMember(next: string): Promise<Member> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (!viewer.profile) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return viewer as Member;
}

/** This request's own origin (localhost, LAN or Tailscale), for invite links that work from where they're made. */
export async function siteOrigin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** Only paths on this site, so ?next= can't hand someone to another site after they sign in. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

/** "acme.in", "www.acme.in/shop/" or "https://acme.in" become a full https address; null if it isn't one. */
export function normalizeWebsite(input: string): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 200) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname)) return null;
    return `https://${url.hostname.toLowerCase()}${url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------- onboarding

export interface Onboarding {
  role: Role;
  displayName: string;
  handle: string | null;
  niche: string | null;
  brand?: { name: string; website: string; category: string | null; teamSize: string | null };
  /** A creator's first brand, invited from the questionnaire. */
  partner?: { name: string; website: string | null };
}

/** Saves the answers; returns the new brand folder's id for a brand. */
export async function saveOnboarding(userId: string, input: Onboarding): Promise<string | null> {
  const brandId = input.role === "brand" && input.brand ? randomUUID() : null;
  const writes: InStatement[] = [
    {
      sql: "INSERT INTO profile (user_id, role, display_name, handle, niche, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [userId, input.role, input.displayName, input.handle, input.niche, now()],
    },
  ];
  if (brandId && input.brand) {
    writes.push({
      sql: "INSERT INTO brand (id, owner_id, name, website, category, team_size, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [brandId, userId, input.brand.name, input.brand.website, input.brand.category, input.brand.teamSize, newToken(), now()],
    });
  }
  if (input.role === "creator" && input.partner) writes.push(invite(userId, input.partner.name, input.partner.website).write);
  await writeAll(writes);
  return brandId;
}

// --------------------------------------------------------------------------------------------------- connections

export interface BrandLink {
  id: string;
  brand_id: string | null;
  brand_name: string;
  brand_website: string | null;
  invite_token: string | null;
  created_at: string;
  reels_sent: number;
}

/** A creator's brands: connected ones, and invites the brand hasn't opened yet (brand_id null). */
export function creatorBrands(creatorId: string): Promise<BrandLink[]> {
  return all<BrandLink>(
    `SELECT c.id, c.brand_id, COALESCE(b.name, c.brand_name) AS brand_name, COALESCE(b.website, c.brand_website) AS brand_website,
            c.invite_token, c.created_at,
            (SELECT COUNT(*) FROM reel r WHERE r.owner_id = c.creator_id AND r.brand_id = c.brand_id AND r.sent_at IS NOT NULL) AS reels_sent
       FROM connection c LEFT JOIN brand b ON b.id = c.brand_id
      WHERE c.creator_id = ? ORDER BY c.created_at DESC`,
    creatorId,
  );
}

export interface CreatorLink {
  creator_id: string;
  display_name: string;
  handle: string | null;
  email: string;
  joined_at: string;
  reels_sent: number;
  last_sent: string | null;
}

export function brandCreators(brandId: string): Promise<CreatorLink[]> {
  return all<CreatorLink>(
    `SELECT c.creator_id, p.display_name, p.handle, u.email, c.created_at AS joined_at,
            (SELECT COUNT(*) FROM reel r WHERE r.owner_id = c.creator_id AND r.brand_id = c.brand_id AND r.sent_at IS NOT NULL) AS reels_sent,
            (SELECT MAX(r.sent_at) FROM reel r WHERE r.owner_id = c.creator_id AND r.brand_id = c.brand_id) AS last_sent
       FROM connection c JOIN profile p ON p.user_id = c.creator_id JOIN "user" u ON u.id = c.creator_id
      WHERE c.brand_id = ? ORDER BY c.created_at DESC`,
    brandId,
  );
}

function invite(creatorId: string, name: string, website: string | null): { token: string; write: InStatement } {
  const token = newToken();
  return {
    token,
    write: {
      sql: "INSERT INTO connection (id, creator_id, brand_id, brand_name, brand_website, invite_token, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)",
      args: [randomUUID(), creatorId, name, website, token, now()],
    },
  };
}

/** A creator invites a brand that may not be here yet. The token goes in the link they send it. */
export async function inviteBrand(creatorId: string, name: string, website: string | null): Promise<string> {
  const { token, write } = invite(creatorId, name, website);
  await writeAll([write]);
  return token;
}

export interface Invite {
  id: string;
  creator_id: string;
  creator_name: string;
  brand_name: string;
  brand_website: string | null;
}

export function inviteByToken(token: string): Promise<Invite | null> {
  return get<Invite>(
    `SELECT c.id, c.creator_id, p.display_name AS creator_name, c.brand_name, c.brand_website
       FROM connection c JOIN profile p ON p.user_id = c.creator_id
      WHERE c.invite_token = ? AND c.brand_id IS NULL`,
    token,
  );
}

/** The brand opens a creator's invite: the pending connection becomes theirs. */
const connected = (creatorId: string, brandId: string) =>
  get("SELECT 1 FROM connection WHERE creator_id = ? AND brand_id = ?", creatorId, brandId);

export async function claimInvite(invite: Invite, brand: Brand): Promise<"claimed" | "already"> {
  if (await connected(invite.creator_id, brand.id)) {
    await run("DELETE FROM connection WHERE id = ?", invite.id);
    return "already";
  }
  await run("UPDATE connection SET brand_id = ?, invite_token = NULL WHERE id = ?", brand.id, invite.id);
  return "claimed";
}

export function brandByCode(code: string): Promise<Brand | null> {
  return get<Brand>("SELECT * FROM brand WHERE invite_code = ?", code);
}

/** A creator opens a brand's own invite link. */
export async function joinBrand(creatorId: string, brand: Brand): Promise<"joined" | "already"> {
  if (await connected(creatorId, brand.id)) return "already";
  await run(
    "INSERT INTO connection (id, creator_id, brand_id, brand_name, brand_website, invite_token, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
    randomUUID(),
    creatorId,
    brand.id,
    brand.name,
    brand.website,
    now(),
  );
  return "joined";
}

// --------------------------------------------------------------------------------------------------------- reels

export type Verdict = "PASS" | "FAIL" | "REVIEW";

export interface ReelRow {
  id: string;
  owner_id: string;
  brand_id: string | null;
  filename: string;
  size_bytes: number;
  status: "checking" | "done" | "error";
  verdict: Verdict | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  owner_name: string;
  brand_name: string | null;
  /** The video in Vercel Blob; null for Reels checked before uploads moved there. */
  video_url: string | null;
}

const REEL_COLUMNS = `r.id, r.owner_id, r.brand_id, r.filename, r.size_bytes, r.status, r.verdict, r.error, r.sent_at, r.created_at,
                      p.display_name AS owner_name, b.name AS brand_name, r.video_url`;
const REEL_FROM = `FROM reel r JOIN profile p ON p.user_id = r.owner_id LEFT JOIN brand b ON b.id = r.brand_id`;

/** A creator's own Reels; for a brand, its own checks plus every Reel a creator has sent it. */
export function reelsFor(viewer: Member): Promise<ReelRow[]> {
  if (viewer.brand) {
    return all<ReelRow>(
      `SELECT ${REEL_COLUMNS} ${REEL_FROM}
        WHERE r.brand_id = ? AND (r.owner_id = ? OR r.sent_at IS NOT NULL)
        ORDER BY COALESCE(r.sent_at, r.created_at) DESC`,
      viewer.brand.id,
      viewer.user.id,
    );
  }
  return all<ReelRow>(`SELECT ${REEL_COLUMNS} ${REEL_FROM} WHERE r.owner_id = ? ORDER BY r.created_at DESC`, viewer.user.id);
}

/** The rule: you see a Reel if you checked it, or if a creator sent it to your brand. */
export function canSee(viewer: Member, reel: Pick<ReelRow, "owner_id" | "brand_id" | "sent_at">) {
  return reel.owner_id === viewer.user.id || (viewer.brand !== null && reel.brand_id === viewer.brand.id && reel.sent_at !== null);
}

export async function reelFor(viewer: Member, id: string): Promise<(ReelRow & { report: Report | null }) | null> {
  const row = await get<ReelRow & { report: string | null }>(`SELECT ${REEL_COLUMNS}, r.report ${REEL_FROM} WHERE r.id = ?`, id);
  if (!row || !canSee(viewer, row)) return null;
  return { ...row, report: row.report ? (JSON.parse(row.report) as Report) : null };
}

export async function startReel(viewer: Member, id: string, filename: string, sizeBytes: number, videoUrl: string) {
  await run(
    "INSERT INTO reel (id, owner_id, brand_id, filename, size_bytes, status, created_at, video_url) VALUES (?, ?, ?, ?, ?, 'checking', ?, ?)",
    id,
    viewer.user.id,
    viewer.brand?.id ?? null,
    filename,
    sizeBytes,
    now(),
    videoUrl,
  );
}

export async function finishReel(id: string, report: Report) {
  await run("UPDATE reel SET status = 'done', verdict = ?, report = ?, error = NULL WHERE id = ?", report.verdict, JSON.stringify(report), id);
}

export async function failReel(id: string, message: string) {
  await run("UPDATE reel SET status = 'error', error = ? WHERE id = ?", message.slice(0, 500), id);
}

/** A creator sends a checked Reel to a brand they're connected to. Returns what went wrong, or null. */
export async function sendReel(viewer: Member, reelId: string, brandId: string): Promise<string | null> {
  if (viewer.profile.role !== "creator") return "Only creators send Reels to brands.";
  const reel = await get<{ owner_id: string; status: string; sent_at: string | null }>(
    "SELECT owner_id, status, sent_at FROM reel WHERE id = ?",
    reelId,
  );
  if (!reel || reel.owner_id !== viewer.user.id) return "That Reel isn't yours.";
  if (reel.status !== "done") return "Check the Reel before you send it.";
  if (reel.sent_at) return "This Reel has already been sent.";
  if (!(await connected(viewer.user.id, brandId))) return "You aren't connected to that brand yet.";
  await run("UPDATE reel SET brand_id = ?, sent_at = ? WHERE id = ?", brandId, now(), reelId);
  return null;
}

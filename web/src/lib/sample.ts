import { get } from "@/lib/db";

// The public Meta sample: one account anyone can sign in to from the landing page. These details are public on
// purpose. Server only (db), so client components get them as props.

export const SAMPLE = {
  name: "Metty McMetaface",
  email: "metty.mcmetaface@meta.test",
  password: "poke-the-metaverse",
} as const;

export const SAMPLE_BANNER = "Sample brand folder. Not run by or affiliated with Meta.";
export const SAMPLE_READ_ONLY = "This is the public Meta sample, so it's read-only. Make your own account to check your own Reels.";

export function isSampleViewer(viewer: { user: { email: string } }): boolean {
  return viewer.user.email.toLowerCase() === SAMPLE.email;
}

/**
 * Why this viewer can't change anything, or null if they can. The sample seals itself: it stays writable until it has
 * a Reel with finished finer details, so it can be seeded through the app like any other account.
 */
export async function requireWritable(viewer: { user: { id: string; email: string } }): Promise<string | null> {
  if (!isSampleViewer(viewer)) return null;
  const sealed = await get(
    `SELECT 1 FROM reel_details d JOIN reel r ON r.id = d.reel_id LEFT JOIN brand b ON b.id = r.brand_id
      WHERE d.status = 'done' AND (r.owner_id = ? OR b.owner_id = ?) LIMIT 1`,
    viewer.user.id,
    viewer.user.id,
  );
  return sealed ? SAMPLE_READ_ONLY : null;
}

/** The same answer for a brand folder seen from outside: every visitor can read the sample's invite link. */
export async function requireWritableBrand(brandId: string): Promise<string | null> {
  const owner = await get<{ id: string; email: string }>(
    `SELECT u.id, u.email FROM brand b JOIN "user" u ON u.id = b.owner_id WHERE b.id = ?`,
    brandId,
  );
  return owner ? requireWritable({ user: owner }) : null;
}

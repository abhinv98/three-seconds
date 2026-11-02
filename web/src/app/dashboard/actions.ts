"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteBrand, normalizeWebsite, requireMember, sendReel } from "@/lib/account";

/** A creator sends a checked Reel to a connected brand. lib/account.ts sendReel checks every part of that. */
export async function sendReelAction(form: FormData) {
  const reelId = String(form.get("reelId") ?? "");
  const viewer = await requireMember(`/dashboard/reels/${reelId}`);
  const problem = await sendReel(viewer, reelId, String(form.get("brandId") ?? ""));
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/reels/${encodeURIComponent(reelId)}?${problem ? `error=${encodeURIComponent(problem)}` : "sent=1"}`);
}

export type InviteState = { error: string } | { token: string; brandName: string } | null;

/** A creator invites a brand. The page shows the link to send them. */
export async function inviteBrandAction(_: InviteState, form: FormData): Promise<InviteState> {
  const viewer = await requireMember("/dashboard/connections");
  if (viewer.profile.role !== "creator") return { error: "Brands invite creators with their own link." };
  const name = String(form.get("brandName") ?? "").trim().slice(0, 80);
  const site = String(form.get("website") ?? "").trim();
  const website = site ? normalizeWebsite(site) : null;
  if (!name) return { error: "Add the brand's name." };
  if (site && !website) return { error: "That website doesn't look right. Try something like acme.in." };
  const token = await inviteBrand(viewer.user.id, name, website);
  revalidatePath("/dashboard/connections");
  return { token, brandName: name };
}

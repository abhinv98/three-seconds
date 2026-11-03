"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { inviteBrand, normalizeWebsite, reelFor, requireMember, sendReel } from "@/lib/account";
import { brandKits, buildBrandKit } from "@/lib/brand-kit";
import { buildFinerDetails, finerDetails } from "@/lib/finer";

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

/** A brand reads (or re-reads) its kit: logo, colours, type and research. It runs after the response; the panel polls. */
export async function readBrandKitAction() {
  const viewer = await requireMember("/dashboard");
  const brand = viewer.brand;
  if (!brand) redirect("/dashboard");
  if (await brandKits.claim(brand.id)) after(() => buildBrandKit(brand));
  revalidatePath("/dashboard");
}

/** Finer details for a checked Reel in a brand's folder. The read runs after the response; the page polls. */
export async function finerDetailsAction(form: FormData) {
  const reelId = String(form.get("reelId") ?? "");
  const viewer = await requireMember(`/dashboard/reels/${reelId}`);
  const back: (error: string) => never = (error) =>
    redirect(`/dashboard/reels/${encodeURIComponent(reelId)}?error=${encodeURIComponent(error)}`);
  const reel = await reelFor(viewer, reelId);
  if (!reel) redirect("/dashboard/reels");
  const { id, filename, video_url, report, brand_id } = reel;
  if (reel.status !== "done" || !report || !video_url) back("Check the Reel before asking for finer details.");
  if (!brand_id) back("Send the Reel to a brand first: finer details are read for the brand it's made for.");
  const kit = await brandKits.get(brand_id);
  if (kit?.status !== "done" || !kit.data) back(`${reel.brand_name ?? "The brand"} needs its brand kit first. Read it from the overview.`);
  const data = kit.data;
  if (await finerDetails.claim(id)) after(() => buildFinerDetails({ id, filename, video_url, report }, data));
  redirect(`/dashboard/reels/${encodeURIComponent(id)}/details`);
}

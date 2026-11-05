"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { inviteBrand, normalizeWebsite, reelFor, requireMember, sendReel } from "@/lib/account";
import { brandKits, buildBrandKit, claimKitRead } from "@/lib/brand-kit";
import { admitSpend } from "@/lib/check-reel";
import { buildFinerDetails, finerDetails } from "@/lib/finer";
import { requireWritable, requireWritableBrand } from "@/lib/sample";
import { buildScene, reelScenes } from "@/lib/scene-job";

/** A creator sends a checked Reel to a connected brand. lib/account.ts sendReel checks every part of that. */
export async function sendReelAction(form: FormData) {
  const reelId = String(form.get("reelId") ?? "");
  const viewer = await requireMember(`/dashboard/reels/${reelId}`);
  const brandId = String(form.get("brandId") ?? "");
  const problem = (await requireWritable(viewer)) ?? (await requireWritableBrand(brandId)) ?? (await sendReel(viewer, reelId, brandId));
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/reels/${encodeURIComponent(reelId)}?${problem ? `error=${encodeURIComponent(problem)}` : "sent=1"}`);
}

export type InviteState = { error: string } | { token: string; brandName: string } | null;

/** A creator invites a brand. The page shows the link to send them. */
export async function inviteBrandAction(_: InviteState, form: FormData): Promise<InviteState> {
  const viewer = await requireMember("/dashboard/connections");
  const readOnly = await requireWritable(viewer);
  if (readOnly) return { error: readOnly };
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
  const refuse: (error: string) => never = (error) => redirect(`/dashboard?error=${encodeURIComponent(error)}`);
  const readOnly = await requireWritable(viewer);
  if (readOnly) refuse(readOnly);
  // A read already running costs nothing more, so a second click takes no count. Only a counted click may claim: a
  // read that ends right here would otherwise let an uncounted one start, past the cap and the kill switch.
  if ((await brandKits.get(brand.id))?.status !== "reading") {
    const refused = await admitSpend("brand_kit");
    if (refused) refuse(refused.error);
    if (await claimKitRead(brand.id)) after(() => buildBrandKit(brand));
  }
  revalidatePath("/dashboard");
}

/** Finer details for a checked Reel in a brand's folder. The read runs after the response; the page polls. */
export async function finerDetailsAction(form: FormData) {
  const reelId = String(form.get("reelId") ?? "");
  const viewer = await requireMember(`/dashboard/reels/${reelId}`);
  const back: (error: string) => never = (error) =>
    redirect(`/dashboard/reels/${encodeURIComponent(reelId)}?error=${encodeURIComponent(error)}`);
  const readOnly = await requireWritable(viewer);
  if (readOnly) back(readOnly);
  const reel = await reelFor(viewer, reelId);
  if (!reel) redirect("/dashboard/reels");
  const { id, filename, video_url, report, brand_id } = reel;
  if (reel.status !== "done" || !report || !video_url) back("Check the Reel before asking for finer details.");
  if (!brand_id) back("Send the Reel to a brand first: finer details are read for the brand it's made for.");
  // The creator who sent a Reel into the sample's folder isn't the sample, and a new read would take its row out of 'done'.
  const sealed = await requireWritableBrand(brand_id);
  if (sealed) back(sealed);
  const kit = await brandKits.get(brand_id);
  if (kit?.status !== "done" || !kit.data) back(`${reel.brand_name ?? "The brand"} needs its brand kit first. Read it from the overview.`);
  const data = kit.data;
  const sceneStatus = (await reelScenes.get(id))?.status;
  const sceneNeeded = sceneStatus !== "done" && sceneStatus !== "reading";
  // A retry of failed tracking must not re-read finished details: that costs money and replaces changes already reviewed.
  const finerStatus = (await finerDetails.get(id))?.status;
  const finerNeeded = finerStatus !== "done" && finerStatus !== "reading";
  // A read already running costs nothing more, so a second click takes no count. Only a counted click may claim, as above.
  if (finerNeeded || sceneNeeded) {
    const refused = await admitSpend("finer");
    if (refused) back(refused.error);
  }
  if (finerNeeded && (await finerDetails.claim(id))) after(() => buildFinerDetails({ id, filename, video_url, report }, data));
  if (sceneNeeded && (await reelScenes.claim(id))) after(() => buildScene({ id, video_url, duration_s: report.video.duration_s }, data));
  // The Studio stays mounted when this lands on the page it's already on; the changed query is how it knows to ask again.
  redirect(`/dashboard/reels/${encodeURIComponent(id)}/details?read=${Date.now()}`);
}

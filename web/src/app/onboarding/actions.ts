"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getViewer, normalizeWebsite, safeNext, saveOnboarding } from "@/lib/account";
import { brandKits, buildBrandKit } from "@/lib/brand-kit";
import { admitSpend } from "@/lib/check-reel";
import { requireWritable } from "@/lib/sample";

export type OnboardingState = { error: string } | null;

/** The questionnaire's answers: a profile, and a brand folder for brands. Everything is checked again here. */
export async function finishOnboarding(_: OnboardingState, form: FormData): Promise<OnboardingState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/onboarding");
  const next = safeNext(String(form.get("next") ?? ""));
  if (viewer.profile) redirect(next);
  const readOnly = await requireWritable(viewer);
  if (readOnly) return { error: readOnly };
  const text = (key: string, max: number) => String(form.get(key) ?? "").trim().slice(0, max);
  const role = form.get("role");

  if (role === "brand") {
    const name = text("brandName", 80);
    const website = normalizeWebsite(text("website", 200));
    if (!name) return { error: "Add your company's name." };
    if (!website) return { error: "Add your website, like acme.in." };
    const brandId = await saveOnboarding(viewer.user.id, {
      role,
      displayName: viewer.user.name,
      handle: null,
      niche: null,
      brand: { name, website, category: text("category", 60) || null, teamSize: text("teamSize", 20) || null },
    });
    // The folder's brand kit is read from the website and the web while they look around (about a minute). Over the
    // daily cap it just doesn't start: the overview offers the button, and pressing it says why.
    if (brandId && !(await admitSpend("brand_kit")) && (await brandKits.claim(brandId))) after(() => buildBrandKit({ id: brandId, name, website }));
  } else if (role === "creator") {
    const displayName = text("displayName", 80) || viewer.user.name;
    const handle = text("handle", 40).replace(/^@+/, "") || null;
    if (handle && !/^[a-z0-9._]{1,30}$/i.test(handle)) return { error: "Instagram handles use letters, numbers, dots and underscores." };
    const partnerName = text("partnerName", 80);
    const partnerSite = text("partnerWebsite", 200);
    const partnerWebsite = partnerSite ? normalizeWebsite(partnerSite) : null;
    if (partnerSite && !partnerWebsite) return { error: "That brand's website doesn't look right. Try something like acme.in." };
    if (partnerSite && !partnerName) return { error: "Add the brand's name too." };
    await saveOnboarding(viewer.user.id, {
      role,
      displayName,
      handle,
      niche: text("niche", 40) || null,
      partner: partnerName ? { name: partnerName, website: partnerWebsite } : undefined,
    });
  } else {
    return { error: "Pick brand or creator first." };
  }

  redirect(next);
}

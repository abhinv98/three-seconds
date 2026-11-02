import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/account/auth-frame";
import { Questionnaire, type Preset } from "@/components/account/questionnaire";
import { brandByCode, getViewer, inviteByToken, safeNext } from "@/lib/account";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === "string" ? query.next : null);
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?mode=sign-up&next=${encodeURIComponent(next)}`);
  if (viewer.profile) redirect(next);

  // Arriving through an invite link: fill in what it already knows.
  let preset: Preset | null = null;
  const invite = next.startsWith("/invite/") ? await inviteByToken(next.slice("/invite/".length)) : null;
  const brand = next.startsWith("/join/") ? await brandByCode(next.slice("/join/".length)) : null;
  if (invite) preset = { role: "brand", brandName: invite.brand_name, website: invite.brand_website ?? "", invitedBy: invite.creator_name };
  else if (brand) preset = { role: "creator", joining: brand.name };

  return (
    <AuthFrame wide>
      <Questionnaire next={next} name={viewer.user.name} preset={preset} />
    </AuthFrame>
  );
}

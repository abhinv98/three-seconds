import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame, NoticeCard } from "@/components/account/auth-frame";
import { Button } from "@/components/ui/button";
import { claimInvite, getViewer, inviteByToken } from "@/lib/account";

export const metadata: Metadata = { title: "Invitation" };

/** A creator's invite to a brand: the brand signs up (its questionnaire prefilled) or signs in, and is connected. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteByToken(token);
  if (!invite) {
    return (
      <AuthFrame>
        <NoticeCard title="This invite has been used">
          <p>Each invite link works once. Ask the creator to send you a new one, or sign in to see your creators.</p>
          <Button asChild size="compact" className="justify-self-start">
            <Link href="/dashboard">Go to my dashboard</Link>
          </Button>
        </NoticeCard>
      </AuthFrame>
    );
  }
  const here = `/invite/${encodeURIComponent(token)}`;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?mode=sign-up&next=${encodeURIComponent(here)}`);
  if (!viewer.profile) redirect(`/onboarding?next=${encodeURIComponent(here)}`);

  if (!viewer.brand) {
    return (
      <AuthFrame>
        <NoticeCard title={`This link is for ${invite.brand_name}`}>
          <p>
            {invite.creator_name} invited {invite.brand_name} to see their checked Reels. You&rsquo;re signed in as a creator, so pass the link to
            someone on the brand&rsquo;s team.
          </p>
          <Button asChild size="compact" className="justify-self-start">
            <Link href="/dashboard">Go to my dashboard</Link>
          </Button>
        </NoticeCard>
      </AuthFrame>
    );
  }
  // Connecting changes data, so it waits for a click (a form POST), not for the page to load.
  async function connect() {
    "use server";
    const member = await getViewer();
    const pending = await inviteByToken(token);
    if (!member?.brand || !pending) redirect(here);
    await claimInvite(pending, member.brand);
    redirect(`/dashboard/connections?claimed=${encodeURIComponent(pending.creator_name)}`);
  }
  return (
    <AuthFrame>
      <NoticeCard title={`${invite.creator_name} wants to send you Reels`}>
        <p>Connect them to {viewer.brand.name}. Reels they send you land in your folder, checked, with the report.</p>
        <form action={connect}>
          <Button type="submit" size="compact">
            Connect {invite.creator_name}
          </Button>
        </form>
      </NoticeCard>
    </AuthFrame>
  );
}

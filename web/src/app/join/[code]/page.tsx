import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthFrame, NoticeCard } from "@/components/account/auth-frame";
import { Button } from "@/components/ui/button";
import { brandByCode, getViewer, joinBrand } from "@/lib/account";
import { requireWritable, requireWritableBrand } from "@/lib/sample";

export const metadata: Metadata = { title: "Join a brand" };

/** A brand's invite link: a creator who opens it joins the brand's folder. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const brand = await brandByCode(code);
  if (!brand) notFound();
  const readOnly = await requireWritableBrand(brand.id);
  if (readOnly) {
    return (
      <AuthFrame>
        <NoticeCard title="This folder is a sample">
          <p>{readOnly}</p>
          <Button asChild size="compact" className="justify-self-start">
            <Link href="/sign-in?mode=sign-up">Make an account</Link>
          </Button>
        </NoticeCard>
      </AuthFrame>
    );
  }
  const here = `/join/${encodeURIComponent(code)}`;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?mode=sign-up&next=${encodeURIComponent(here)}`);
  if (!viewer.profile) redirect(`/onboarding?next=${encodeURIComponent(here)}`);

  if (viewer.profile.role === "brand") {
    return (
      <AuthFrame>
        <NoticeCard title="This link is for creators">
          <p>{brand.name} sends this link to the creators who make its Reels. You&rsquo;re signed in as a brand.</p>
          <Button asChild size="compact" className="justify-self-start">
            <Link href="/dashboard">Go to my dashboard</Link>
          </Button>
        </NoticeCard>
      </AuthFrame>
    );
  }
  // Joining changes data, so it waits for a click (a form POST), not for the page to load.
  async function join() {
    "use server";
    const member = await getViewer();
    const target = await brandByCode(code);
    if (!member?.profile || member.profile.role !== "creator" || !target) redirect(here);
    if ((await requireWritable(member)) || (await requireWritableBrand(target.id))) redirect(here);
    await joinBrand(member.user.id, target);
    redirect(`/dashboard/connections?joined=${encodeURIComponent(target.name)}`);
  }
  return (
    <AuthFrame>
      <NoticeCard title={`Join ${brand.name}`}>
        <p>
          {brand.name} ({brand.website.replace(/^https:\/\//, "")}) invited you. Once you join, you can send them Reels you&rsquo;ve checked, report and
          all.
        </p>
        <form action={join}>
          <Button type="submit" size="compact">
            Join {brand.name}
          </Button>
        </form>
      </NoticeCard>
    </AuthFrame>
  );
}

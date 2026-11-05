import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/account/auth-frame";
import { SignInForm } from "@/components/account/sign-in-form";
import { getViewer, safeNext } from "@/lib/account";
import { isSampleViewer, SAMPLE, SAMPLE_BANNER } from "@/lib/sample";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const sample = query.sample === "meta";
  const next = sample ? "/dashboard" : safeNext(typeof query.next === "string" ? query.next : null);
  const viewer = await getViewer();
  // Someone in their own account can still open the sample: the one click swaps accounts.
  if (viewer && (!sample || isSampleViewer(viewer))) redirect(next);
  return (
    <AuthFrame>
      <SignInForm
        next={next}
        initialMode={query.mode === "sign-up" ? "sign-up" : "sign-in"}
        sample={sample ? { ...SAMPLE, label: SAMPLE_BANNER, leaving: viewer?.user.email ?? null } : null}
      />
    </AuthFrame>
  );
}

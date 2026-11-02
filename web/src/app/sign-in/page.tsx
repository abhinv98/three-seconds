import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/account/auth-frame";
import { SignInForm } from "@/components/account/sign-in-form";
import { getViewer, safeNext } from "@/lib/account";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === "string" ? query.next : null);
  if (await getViewer()) redirect(next);
  return (
    <AuthFrame>
      <SignInForm next={next} initialMode={query.mode === "sign-up" ? "sign-up" : "sign-in"} />
    </AuthFrame>
  );
}

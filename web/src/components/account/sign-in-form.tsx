"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Tick } from "@/components/landing/tick";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ next, initialMode }: { next: string; initialMode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError(null);
    const { error: failure } = signUp
      ? await authClient.signUp.email({ name: String(form.get("name") ?? "").trim() || email.split("@")[0], email, password })
      : await authClient.signIn.email({ email, password });
    if (failure) {
      setBusy(false);
      setError(failure.message ?? "That didn't work. Try again.");
      return;
    }
    // New accounts answer the questionnaire first; it sends them on to `next` afterwards.
    router.replace(signUp ? `/onboarding?next=${encodeURIComponent(next)}` : next);
    router.refresh();
  }

  return (
    <div className="grid gap-7">
      <div className="flex items-end gap-4">
        <span className="shrink-0 [&_canvas]:[image-rendering:pixelated]">
          <Tick size={72} mood={signUp ? "hi" : "idle"} lcd="3s" />
        </span>
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em]">
            {signUp ? "Make an account" : "Sign in"}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {signUp ? "For brands, and the creators who make their Reels." : "Your Reels are where you left them."}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-4">
        {signUp ? (
          <Field label="Your name">
            <Input name="name" autoComplete="name" maxLength={80} required />
          </Field>
        ) : null}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" maxLength={200} required />
        </Field>
        <Field label="Password" hint={signUp ? "At least 8 characters." : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-fail-text">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="compact" disabled={busy} className="mt-1">
          {busy ? "One second…" : signUp ? "Make my account" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {signUp ? "Already have an account? " : "New here? "}
        <button
          type="button"
          className="rounded-sm font-semibold text-foreground underline underline-offset-4"
          onClick={() => {
            setMode(signUp ? "sign-in" : "sign-up");
            setError(null);
          }}
        >
          {signUp ? "Sign in" : "Make an account"}
        </button>
      </p>
    </div>
  );
}

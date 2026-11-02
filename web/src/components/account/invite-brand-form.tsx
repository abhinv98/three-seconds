"use client";

import { useActionState } from "react";
import { inviteBrandAction } from "@/app/dashboard/actions";
import { CopyLink } from "@/components/account/copy-link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/** A creator names a brand they make Reels for and gets the link to send it. */
export function InviteBrandForm({ origin }: { origin: string }) {
  const [state, action, pending] = useActionState(inviteBrandAction, null);
  return (
    <div className="grid gap-4 p-5">
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Brand name">
          <Input name="brandName" maxLength={80} required autoComplete="off" />
        </Field>
        <Field label="Their website">
          <Input name="website" placeholder="acme.in" maxLength={200} autoComplete="off" />
        </Field>
        <Button type="submit" size="compact" disabled={pending}>
          {pending ? "Making link…" : "Get invite link"}
        </Button>
      </form>
      {state && "error" in state ? (
        <p role="alert" className="text-sm font-semibold text-fail-text">
          {state.error}
        </p>
      ) : null}
      {state && "token" in state ? (
        <div className="grid gap-2 rounded-[6px] bg-muted p-3.5">
          <p className="text-sm font-semibold">Send this to {state.brandName}. When they open it, they join and see the Reels you send.</p>
          <CopyLink url={`${origin}/invite/${state.token}`} />
        </div>
      ) : null}
    </div>
  );
}

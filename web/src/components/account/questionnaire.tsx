"use client";

import { ArrowLeft, ArrowRight, Building2, Clapperboard } from "lucide-react";
import { useActionState, useState } from "react";
import { finishOnboarding } from "@/app/onboarding/actions";
import { ReadingBody } from "@/components/brand/brand-folder";
import { Tick } from "@/components/landing/tick";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { guessBrandName, hostOf } from "@/lib/site-name";

type Role = "brand" | "creator";

/** What an invite link already knows: a creator's invite fills in the brand, a brand's link names the folder. */
export interface Preset {
  role: Role;
  brandName?: string;
  website?: string;
  invitedBy?: string;
  joining?: string;
}

const CATEGORIES = ["Beauty and personal care", "Fashion", "Food and drink", "Health and fitness", "Tech and gadgets", "Finance", "Travel", "Something else"];
const TEAM_SIZES = ["1 to 5", "6 to 20", "21 to 50", "More than 50"];
const NICHES = ["Beauty", "Fashion", "Food", "Fitness", "Tech", "Finance", "Travel", "Comedy", "Lifestyle", "Something else"];

export function Questionnaire({ next, name, preset }: { next: string; name: string; preset: Preset | null }) {
  const [role, setRole] = useState<Role | null>(preset?.role ?? null);
  const [state, action, pending] = useActionState(finishOnboarding, null);
  const [website, setWebsite] = useState(preset?.website ?? "");
  // The name box follows the website until someone types in it.
  const [typedName, setTypedName] = useState(preset?.brandName ?? null);
  const site = hostOf(website);
  const brandName = typedName ?? guessBrandName(website);

  // The moment a brand presses the button its folder is being built, so the screen already says so. The kit's read starts
  // on the server, and the overview picks up this same view with the real clock.
  if (pending && role === "brand" && site) {
    return (
      <div className="@container overflow-hidden rounded-[10px] border border-border bg-card">
        <ReadingBody site={site} steps={[{ s: 0, text: `Making the folder and starting on ${site}` }]} />
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          {role === "brand" ? null : <p className="text-[13px] font-semibold text-muted-foreground">Step {role ? 2 : 1} of 2</p>}
          <h1 className="mt-1 text-[30px] leading-[1.05] font-bold tracking-[-0.03em]">{!role ? "Who's checking Reels?" : role === "brand" ? "What's your brand's website?" : "Tell us about you"}</h1>
          <p className="mt-2 max-w-[460px] text-[15px] text-muted-foreground">
            {!role
              ? "Brands and creators see different things here. Pick the one that's you."
              : role === "brand"
                ? "That's all it takes. We read its logo, colours and type, and what people say about it, and your brand folder starts from there."
                : "Check Reels before they go anywhere, then send the passing ones to the brand."}
          </p>
        </div>
        <span className="hidden shrink-0 sm:block [&_canvas]:[image-rendering:pixelated]">
          <Tick size={84} mood={role ? "read" : "hi"} lcd="3s" />
        </span>
      </div>

      {!role ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <RoleCard
            icon={<Building2 size={22} aria-hidden="true" />}
            title="We're a brand"
            body="We hire creators and need every paid Reel labelled before it goes live."
            onPick={() => setRole("brand")}
          />
          <RoleCard
            icon={<Clapperboard size={22} aria-hidden="true" />}
            title="I'm a creator"
            body="I make Reels for brands and want them cleared before I post or send them."
            onPick={() => setRole("creator")}
          />
        </div>
      ) : (
        <form action={action} className="grid gap-5">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="next" value={next} />
          {preset?.invitedBy && role === "brand" ? (
            <p className="rounded-[6px] bg-muted px-3 py-2 text-sm">
              {preset.invitedBy} invited you. Once your folder exists, their Reels show up in it.
            </p>
          ) : null}
          {preset?.joining && role === "creator" ? (
            <p className="rounded-[6px] bg-muted px-3 py-2 text-sm">You&rsquo;re joining {preset.joining}&rsquo;s folder.</p>
          ) : null}

          {role === "brand" ? (
            <>
              <Field label="Website" hint="Your site or your brand's Instagram page.">
                <Input
                  name="website"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="acme.in"
                  maxLength={200}
                  required
                  autoFocus
                  autoComplete="url"
                  inputMode="url"
                  className="h-13 text-[18px] font-semibold"
                />
              </Field>
              <Field label="Company name">
                <Input name="brandName" value={brandName} onChange={(event) => setTypedName(event.target.value)} maxLength={80} required autoComplete="organization" />
              </Field>
              <details className="rounded-[6px] border border-border px-3 py-2 text-sm">
                <summary className="cursor-pointer font-semibold text-muted-foreground">Add what you sell and how many creators you hire (optional)</summary>
                <div className="mt-3 grid gap-5 sm:grid-cols-2">
                  <Field label="What you sell">
                    <Select name="category" defaultValue="">
                      <option value="">Choose one</option>
                      {CATEGORIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Creators a month">
                    <Select name="teamSize" defaultValue="">
                      <option value="">Choose one</option>
                      {TEAM_SIZES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your name">
                  <Input name="displayName" defaultValue={name} maxLength={80} required autoComplete="name" />
                </Field>
                <Field label="Instagram handle">
                  <Input name="handle" placeholder="@yourname" maxLength={40} autoComplete="off" />
                </Field>
              </div>
              <Field label="What you make">
                <Select name="niche" defaultValue="">
                  <option value="">Choose one</option>
                  {NICHES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              {!preset?.joining ? (
                <fieldset className="grid gap-4 rounded-[10px] border border-border p-4">
                  <legend className="px-1 text-sm font-semibold">Making a Reel for a brand right now?</legend>
                  <p className="-mt-1 text-[13px] text-muted-foreground">
                    Optional. You&rsquo;ll get a link to send them, so they see your checked Reels in their folder.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Brand name">
                      <Input name="partnerName" maxLength={80} autoComplete="off" />
                    </Field>
                    <Field label="Their website">
                      <Input name="partnerWebsite" placeholder="acme.in" maxLength={200} autoComplete="off" />
                    </Field>
                  </div>
                </fieldset>
              ) : null}
            </>
          )}

          {state?.error ? (
            <p role="alert" className="text-sm font-semibold text-fail-text">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" size={role === "brand" ? "md" : "compact"} disabled={pending || (role === "brand" && !site)}>
              {pending ? "Setting up…" : role === "brand" ? "Build my brand folder" : "Set up my account"}
              {role === "brand" ? <ArrowRight size={17} aria-hidden="true" /> : null}
            </Button>
            <Button type="button" variant="ghost" size="compact" onClick={() => setRole(null)} disabled={pending}>
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function RoleCard({ icon, title, body, onPick }: { icon: React.ReactNode; title: string; body: string; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group grid gap-3 rounded-[6px] border border-border bg-card p-5 text-left transition-[border-color,translate] duration-[120ms] ease-out hover:border-foreground/40 active:translate-y-px"
    >
      <span className="grid size-10 place-items-center rounded-[6px] bg-foreground text-background">{icon}</span>
      <span className="text-[17px] font-bold tracking-[-0.01em]">{title}</span>
      <span className="text-sm text-muted-foreground">{body}</span>
    </button>
  );
}

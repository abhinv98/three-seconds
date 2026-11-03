import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { finerDetailsAction } from "@/app/dashboard/actions";
import { Notice, PageHeader } from "@/components/account/bits";
import { AutoRefresh } from "@/components/auto-refresh";
import { FinerDetailsScreen } from "@/components/details/finer-details";
import { Button } from "@/components/ui/button";
import { reelFor, requireMember } from "@/lib/account";
import { fontCss } from "@/lib/brand-kit";
import { finerDetails } from "@/lib/finer";

export const metadata = { title: "Finer details" };
// "Read again" runs the pass after its response, inside this page's function.
export const maxDuration = 300;

const STEPS = [
  "A frame a second goes to the model, with the ASCI report, the transcript and the brand kit.",
  "It lists what to change before the Reel goes live, and where each change shows.",
  "SAM 3.1 follows each of those on screen, frame by frame, so the outlines move with them.",
];

export default async function FinerDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireMember(`/dashboard/reels/${id}/details`);
  const reel = await reelFor(viewer, id);
  if (!reel) notFound();
  const job = await finerDetails.get(reel.id);
  if (!job) redirect(`/dashboard/reels/${reel.id}`);
  const back = { href: `/dashboard/reels/${reel.id}`, label: reel.filename };
  const again = (label: string) => (
    <form action={finerDetailsAction}>
      <input type="hidden" name="reelId" value={reel.id} />
      <Button type="submit" size="compact" variant="outline">
        <RefreshCw size={15} aria-hidden="true" />
        {label}
      </Button>
    </form>
  );

  if (job.status === "done" && job.data) {
    const fonts = job.data.brand.webFonts ?? [];
    return (
      <>
        {fonts.map((f) => (
          <link key={f} rel="stylesheet" href={fontCss(f)} precedence="default" />
        ))}
        <FinerDetailsScreen
          details={job.data}
          brandFont={[...job.data.brand.fonts.map((f) => `"${f.replace(/["\\]/g, "")}"`), "sans-serif"].join(", ")}
          back={back}
          action={again("Read again")}
        />
      </>
    );
  }

  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(job.started_at)) / 1000));
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link
          href={back.href}
          className="inline-flex w-fit max-w-full items-center gap-1.5 truncate rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {back.label}
        </Link>
        <PageHeader
          title="Finer details"
          description={`What to change in ${reel.filename} for ${reel.brand_name ?? "its brand"}, where it shows, and why it matters.`}
        />
      </div>
      {job.status === "reading" ? (
        <section aria-live="polite" className="grid max-w-[640px] gap-4 rounded-[10px] border border-border bg-card p-5">
          <AutoRefresh />
          <p className="text-[15px] font-bold">
            Reading the Reel <span className="font-normal text-muted-foreground tabular-nums">· {seconds}s so far, about two minutes in all</span>
          </p>
          <ol className="grid gap-2.5 text-sm text-muted-foreground">
            {STEPS.map((step, i) => (
              <li key={step} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                <span className="font-bold text-foreground tabular-nums">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-muted-foreground">This page updates by itself. You can leave it and come back.</p>
        </section>
      ) : (
        <div className="grid max-w-[640px] justify-items-start gap-3">
          <Notice tone="fail">The read didn&rsquo;t finish: {job.error}</Notice>
          {again("Try again")}
        </div>
      )}
    </div>
  );
}

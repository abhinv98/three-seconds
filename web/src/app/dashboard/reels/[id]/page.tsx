import { ArrowLeft, ArrowRight, ScanSearch, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finerDetailsAction, sendReelAction } from "@/app/dashboard/actions";
import { Notice, Panel, ReelStatus, when } from "@/components/account/bits";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportView } from "@/components/report-view";
import { CaptionPanel } from "@/components/review/caption-panel";
import { ReviewBadge, ReviewPanel } from "@/components/review/review-panel";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { creatorBrands, reelFor, requireMember, type ReelRow } from "@/lib/account";
import { brandKits } from "@/lib/brand-kit";
import { finerDetails } from "@/lib/finer";
import { captionFor, reviewFor } from "@/lib/review";
import { requireWritable } from "@/lib/sample";

export const metadata = { title: "Reel" };
// "Get finer details" reads the Reel after its response, inside this page's function.
export const maxDuration = 300;

export default async function ReelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const viewer = await requireMember(`/dashboard/reels/${id}`);
  const reel = await reelFor(viewer, id);
  if (!reel) notFound();
  const query = await searchParams;
  const mine = reel.owner_id === viewer.user.id;
  const canSend = viewer.profile.role === "creator" && mine && reel.status === "done" && !reel.sent_at;
  const [brands, review, caption, sampleReadOnly] = await Promise.all([
    canSend ? creatorBrands(viewer.user.id).then((all) => all.filter((b) => b.brand_id)) : [],
    reviewFor(reel.id),
    captionFor(reel.id),
    requireWritable(viewer),
  ]);
  const ownsFolder = viewer.brand !== null && reel.brand_id === viewer.brand.id;
  // The report plays the video from the access-checked route, not wherever it was first uploaded.
  const report = reel.report ? { ...reel.report, video: { ...reel.report.video, blob_url: `/api/reels/${reel.id}/video` } } : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/dashboard/reels" className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} aria-hidden="true" />
            Reels
          </Link>
          <p className="min-w-0 text-sm text-muted-foreground">
            {mine ? "Checked" : `Sent by ${reel.owner_name}`} {when(reel.sent_at && !mine ? reel.sent_at : reel.created_at)}
            {mine && reel.sent_at ? ` · sent to ${reel.brand_name} ${when(reel.sent_at)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {review ? <ReviewBadge status={review.status} /> : null}
          {report ? null : <ReelStatus reel={reel} />}
        </div>
      </div>

      {report ? null : <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] break-all">{reel.filename}</h1>}
      {query.sent === "1" && reel.sent_at ? <Notice>Sent to {reel.brand_name}. It&rsquo;s in their folder now, with this report.</Notice> : null}
      {typeof query.error === "string" ? <Notice tone="fail">{query.error}</Notice> : null}

      {canSend ? (
        <Panel title="Send to a brand">
          {brands.length ? (
            <form action={sendReelAction} className="flex flex-wrap items-end gap-3 p-5">
              <input type="hidden" name="reelId" value={reel.id} />
              <label className="grid min-w-[220px] flex-1 gap-1.5">
                <span className="text-sm font-semibold">Brand</span>
                <Select name="brandId" required defaultValue={brands[0].brand_id ?? ""}>
                  {brands.map((b) => (
                    <option key={b.id} value={b.brand_id ?? ""}>
                      {b.brand_name}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" size="compact">
                <Send size={15} aria-hidden="true" />
                Send with report
              </Button>
              {reel.verdict !== "PASS" ? (
                <p className="basis-full text-[13px] text-muted-foreground">
                  This Reel didn&rsquo;t pass. You can still send it, and the brand sees the same report you do.
                </p>
              ) : null}
            </form>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              You aren&rsquo;t connected to a brand yet.{" "}
              <Link href="/dashboard/connections" className="rounded-sm font-semibold text-foreground underline underline-offset-4">
                Connect one
              </Link>{" "}
              to send them this Reel.
            </p>
          )}
        </Panel>
      ) : null}

      {reel.status === "error" ? (
        <Notice tone="fail">
          This check didn&rsquo;t finish: {reel.error}{" "}
          <Link href="/dashboard/check" className="underline underline-offset-4">
            Try again
          </Link>
        </Notice>
      ) : null}
      {reel.status === "checking" ? (
        <p role="status" className="text-sm text-muted-foreground">
          <AutoRefresh />
          Still checking. This page updates by itself.
        </p>
      ) : null}
      {report ? (
        <ReportView
          id={reel.id}
          report={report}
          embedded
          revealKey={reel.id}
          afterVerdict={reel.status === "done" ? <FinerBand reel={reel} /> : null}
          aside={
            <div className="grid gap-4">
              {ownsFolder || review ? <ReviewPanel reelId={reel.id} review={review} readOnly={!ownsFolder || sampleReadOnly !== null} /> : null}
              <CaptionPanel reelId={reel.id} caption={caption} measured={reel.verdict} readOnly={sampleReadOnly !== null} />
            </div>
          }
        />
      ) : null}
    </div>
  );
}

/** The way into the finer-details pass: what to change for the brand, where it shows, and why. Nobody should miss it. */
async function FinerBand({ reel }: { reel: ReelRow }) {
  if (!reel.brand_id) {
    return (
      <p className="rounded-[10px] border border-dashed border-input px-5 py-3.5 text-sm text-muted-foreground">
        Send this Reel to a brand to get finer details for it: what to change, where it shows, and why it matters to that brand.
      </p>
    );
  }
  const [job, kit] = await Promise.all([finerDetails.get(reel.id), brandKits.get(reel.brand_id)]);
  const brandName = reel.brand_name ?? "the brand";
  const kitReady = kit?.status === "done" && kit.data !== null;
  const open = (label: string) => (
    <Button asChild size="lg" className="w-full sm:w-auto">
      <Link href={`/dashboard/reels/${reel.id}/details`}>
        <ScanSearch size={20} aria-hidden="true" />
        {label}
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
    </Button>
  );
  const start = (label: string, disabled = false) => (
    <form action={finerDetailsAction} className="w-full sm:w-auto">
      <input type="hidden" name="reelId" value={reel.id} />
      <Button type="submit" size="lg" disabled={disabled} className="w-full sm:w-auto">
        <ScanSearch size={20} aria-hidden="true" />
        {label}
        <ArrowRight size={20} aria-hidden="true" />
      </Button>
    </form>
  );

  let body: string;
  let action: React.ReactNode;
  if (job?.status === "done" && job.data) {
    body = `${job.data.moments.length} changes for ${brandName}, traced on the Reel with SAM 3.1. ${job.data.finding}`;
    action = open("Open Finer details");
  } else if (job?.status === "reading") {
    body = `Reading the Reel for ${brandName} and tracking it with SAM 3.1. About two minutes. You can open it while it runs.`;
    action = open("See Finer details");
  } else {
    body =
      job?.status === "error"
        ? `The last read didn't finish: ${job.error}`
        : kitReady
          ? `What to change before it goes live for ${brandName}: traced on the Reel frame by frame, with the reason it matters to ${brandName}.`
          : kit?.status === "reading"
            ? `${brandName}'s brand kit is still being read. Finer details use its colours and research, so they open once it's done.`
            : `${brandName} needs its brand kit first, read from its website on the overview.`;
    action = start(job?.status === "error" ? "Try Finer details again" : "Get Finer details", !kitReady);
  }
  return (
    <section aria-label="Finer details" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[10px] border-[1.5px] border-[var(--ink-950)] bg-brand-surface px-4 py-3.5 sm:px-5">
      <div className="min-w-[240px] flex-1">
        <h2 className="text-[17px] leading-tight font-bold tracking-[-0.01em]">Finer details for {brandName}</h2>
        <p className="mt-0.5 line-clamp-2 max-w-[80ch] text-sm text-foreground/80">{body}</p>
      </div>
      {action}
    </section>
  );
}

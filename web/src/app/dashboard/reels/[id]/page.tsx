import { ArrowLeft, ArrowRight, ScanSearch, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finerDetailsAction, sendReelAction } from "@/app/dashboard/actions";
import { Notice, Panel, ReelStatus, when } from "@/components/account/bits";
import { ReportView } from "@/components/report-view";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { creatorBrands, reelFor, requireMember, type ReelRow } from "@/lib/account";
import { brandKits } from "@/lib/brand-kit";
import { finerDetails } from "@/lib/finer";

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
  const brands = canSend ? (await creatorBrands(viewer.user.id)).filter((b) => b.brand_id) : [];
  // The report plays the video from the access-checked route, not wherever it was first uploaded.
  const report = reel.report ? { ...reel.report, video: { ...reel.report.video, blob_url: `/api/reels/${reel.id}/video` } } : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/dashboard/reels" className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} aria-hidden="true" />
          Reels
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
          <div className="min-w-0">
            <h1 className="text-[24px] leading-tight font-bold tracking-[-0.02em] break-all">{reel.filename}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mine ? "Checked" : `Sent by ${reel.owner_name}`} {when(reel.sent_at && !mine ? reel.sent_at : reel.created_at)}
              {mine && reel.sent_at ? ` · sent to ${reel.brand_name} ${when(reel.sent_at)}` : ""}
            </p>
          </div>
          <ReelStatus reel={reel} />
        </div>
      </div>

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
      {reel.status === "checking" ? <p className="text-sm text-muted-foreground">Still checking. Refresh in a moment.</p> : null}
      {reel.status === "done" ? <FinerPanel reel={reel} /> : null}
      {report ? <ReportView id={reel.id} report={report} embedded /> : null}
    </div>
  );
}

/** The way into the finer-details pass: what to change for the brand, where it shows, and why. */
async function FinerPanel({ reel }: { reel: ReelRow }) {
  if (!reel.brand_id) {
    return (
      <p className="rounded-[10px] border border-dashed border-border px-5 py-3.5 text-sm text-muted-foreground">
        Send this Reel to a brand to get finer details for it: what to change, where it shows, and why it matters to that brand.
      </p>
    );
  }
  const [job, kit] = await Promise.all([finerDetails.get(reel.id), brandKits.get(reel.brand_id)]);
  const open = (label: string) => (
    <Button asChild size="compact">
      <Link href={`/dashboard/reels/${reel.id}/details`}>
        {label}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </Button>
  );
  const start = (label: string, disabled = false) => (
    <form action={finerDetailsAction}>
      <input type="hidden" name="reelId" value={reel.id} />
      <Button type="submit" size="compact" disabled={disabled}>
        <ScanSearch size={15} aria-hidden="true" />
        {label}
      </Button>
    </form>
  );
  const kitReady = kit?.status === "done" && kit.data !== null;
  const brandName = reel.brand_name ?? "the brand";

  let body: React.ReactNode;
  let action: React.ReactNode;
  if (job?.status === "done" && job.data) {
    body = `${job.data.moments.length} changes for ${brandName}, outlined on the Reel. ${job.data.finding}`;
    action = open("Open finer details");
  } else if (job?.status === "reading") {
    body = `Reading the Reel for ${brandName}: the frames, what to change, then tracing each change on screen. About two minutes.`;
    action = open("See progress");
  } else {
    body =
      job?.status === "error"
        ? `The last read didn't finish: ${job.error}`
        : kitReady
          ? `A closer read for ${brandName}: what to change before it goes live, outlined on the Reel, with the reason it matters to ${brandName}.`
          : kit?.status === "reading"
            ? `${brandName}'s brand kit is still being read. Finer details use its colours and research, so they open once it's done.`
            : `${brandName} needs its brand kit first, read from its website on the overview.`;
    action = start(job?.status === "error" ? "Try again" : "Get finer details", !kitReady);
  }
  return (
    <Panel title="Finer details">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <p className="max-w-[640px] min-w-0 flex-1 text-sm text-muted-foreground">{body}</p>
        {action}
      </div>
    </Panel>
  );
}

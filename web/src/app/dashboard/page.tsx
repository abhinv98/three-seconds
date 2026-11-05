import { ArrowRight, ChevronRight, Upload } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { BrandKitPanel } from "@/components/account/brand-kit-panel";
import { CopyLink } from "@/components/account/copy-link";
import { CountedOnce, CountUp } from "@/components/account/count-up";
import { Notice, Panel, when } from "@/components/account/bits";
import { ReelThumb } from "@/components/account/reel-thumb";
import { WeeklyTrend } from "@/components/account/weekly-trend";
import { Tick } from "@/components/landing/tick";
import { Button } from "@/components/ui/button";
import { brandCreators, creatorBrands, requireMember, siteOrigin, type Member } from "@/lib/account";
import { brandKits } from "@/lib/brand-kit";
import { overviewReels, summarize, type Overview, type QueueItem } from "@/lib/overview";
import { reviewsFor } from "@/lib/review";
import { requireWritable } from "@/lib/sample";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };
const COUNTED_COOKIE = "ts-counted";
// Reading the brand kit runs after the "Read brand kit" response, inside this page's function.
export const maxDuration = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireMember("/dashboard");
  const query = await searchParams;
  const brand = viewer.brand;
  const [reels, kit, counted, readOnly] = await Promise.all([overviewReels(viewer), brand ? brandKits.get(brand.id) : null, cookies(), requireWritable(viewer)]);
  const reviews = await reviewsFor(reels.map((r) => r.id));
  const overview = summarize(reels, reviews, { id: viewer.user.id, brandView: brand !== null });
  const animate = counted.get(COUNTED_COOKIE)?.value !== viewer.user.id;
  const empty = reels.length === 0;
  const site = brand?.website.replace(/^https:\/\/(www\.)?/, "") ?? "";
  // A kit being read, just read or missing is the news on this page; once it has been seen it moves below the work.
  const kitOnTop = brand !== null && (empty || !kit?.data || kit.status === "reading" || query.kit === "new");
  const kitPanel = brand ? <BrandKitPanel brandId={brand.id} job={kit} site={site} readOnly={readOnly !== null} /> : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {typeof query.error === "string" ? <Notice tone="fail">{query.error}</Notice> : null}
      <header className="flex items-center gap-3">
        {/* Right beside the kit panel it would give away the logo the panel is about to form. */}
        {kit?.data?.logo && !kitOnTop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={kit.data.logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-[8px] border border-border bg-[var(--paper-50)] object-contain p-1.5" />
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] leading-tight font-bold tracking-[-0.03em]">{brand ? brand.name : `Hi, ${viewer.profile.display_name.split(" ")[0]}`}</h1>
          <p className="text-sm text-muted-foreground">{brand ? `${site} · brand folder` : "Check a Reel before it goes anywhere, then send the passing ones to your brands."}</p>
        </div>
      </header>

      {kitOnTop ? kitPanel : null}

      {empty ? (
        <NextStep viewer={viewer} />
      ) : (
        <>
          <Kpis overview={overview} animate={animate} brandView={brand !== null} sent={reels.filter((r) => r.sent_at).length} />
          <CountedOnce cookie={COUNTED_COOKIE} userId={viewer.user.id} />
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_372px]">
            <Queue items={overview.queue} brandView={brand !== null} viewerId={viewer.user.id} />
            <div className="grid gap-5">
              <Panel title="Reels checked per week">
                <WeeklyTrend weeks={overview.trend} />
              </Panel>
              <Activity overview={overview} />
            </div>
          </div>
        </>
      )}

      {brand ? (
        <div className={cn("grid items-start gap-5", !kitOnTop && "xl:grid-cols-[minmax(0,1fr)_372px]")}>
          {kitOnTop ? null : kitPanel}
          <CreatorsPanel brandId={brand.id} code={brand.invite_code} />
        </div>
      ) : (
        <BrandsPanel creatorId={viewer.user.id} />
      )}
    </div>
  );
}

function Kpis({ overview, animate, brandView, sent }: { overview: Overview; animate: boolean; brandView: boolean; sent: number }) {
  const { checked, checkedThisWeek, passed, reviewing, failed, passRate, hold, topFailure, watch } = overview;
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-border bg-card md:grid-cols-3 xl:grid-cols-[1fr_1.1fr_1.1fr_1.5fr_1.3fr] [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
      <Kpi label="Reels checked" foot={`${checkedThisWeek} this week`}>
        <CountUp value={checked} animate={animate} />
      </Kpi>
      <Kpi label="Pass rate" foot={checked ? `${passed} of ${checked} passed` : "Nothing checked yet"}>
        {passRate === null ? "None yet" : <CountUp value={passRate * 100} suffix="%" animate={animate} />}
        {checked ? (
          <span aria-hidden="true" className="mt-2 flex h-1.5 gap-0.5">
            {passed ? <span className="rounded-l-[2px] bg-pass" style={{ flexGrow: passed }} /> : null}
            {reviewing ? <span className="bg-review" style={{ flexGrow: reviewing }} /> : null}
            {failed ? <span className="rounded-r-[2px] bg-fail" style={{ flexGrow: failed }} /> : null}
          </span>
        ) : null}
      </Kpi>
      <Kpi label="Average hold" foot={hold ? `of ${hold.needed.toFixed(1)}s ASCI needs` : "Nothing checked yet"}>
        {hold ? <CountUp value={hold.held} decimals={1} suffix="s" animate={animate} /> : "None yet"}
        {hold ? (
          <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-[2px] bg-muted">
            <span className={cn("block h-full origin-left", hold.held >= hold.needed ? "bg-pass" : "bg-fail")} style={{ transform: `scaleX(${Math.min(1, hold.held / hold.needed)})` }} />
          </span>
        ) : null}
      </Kpi>
      <Kpi label="Most common failure" foot={topFailure ? `${topFailure.count} of ${failed} failed Reels` : "Nothing has failed"} wordy>
        {topFailure ? (
          <Link href="/dashboard/reels?verdict=FAIL" className="kpi-link rounded-sm">
            {topFailure.title}
          </Link>
        ) : (
          "None"
        )}
      </Kpi>
      {brandView ? (
        <Kpi
          label="Creators to watch"
          foot={
            watch.length ? (
              <span className="flex flex-wrap gap-x-1.5">
                {watch.slice(0, 2).map((c, i) => (
                  <Link key={c.id} href={`/dashboard/reels?creator=${encodeURIComponent(c.id)}`} className="kpi-link rounded-sm">
                    {c.name} ({c.fails})
                    {i < Math.min(watch.length, 2) - 1 ? "," : ""}
                  </Link>
                ))}
              </span>
            ) : (
              "No creator has a fail"
            )
          }
        >
          <CountUp value={watch.length} animate={animate} />
        </Kpi>
      ) : (
        <Kpi label="Sent to brands" foot={`${checked - sent > 0 ? checked - sent : 0} not sent yet`}>
          <CountUp value={sent} animate={animate} />
        </Kpi>
      )}
    </dl>
  );
}

function Kpi({ label, foot, wordy, children }: { label: string; foot: React.ReactNode; wordy?: boolean; children: React.ReactNode }) {
  return (
    <div className="kpi flex min-w-0 flex-col px-4 py-3.5 sm:px-5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 flex flex-col font-bold tracking-[-0.03em]", wordy ? "min-h-[46px] justify-center text-[17px] leading-[1.25] tracking-[-0.01em]" : "text-[32px] leading-[38px]")}>{children}</dd>
      <dd className="mt-auto pt-1.5 text-[12.5px] leading-snug text-muted-foreground">{foot}</dd>
    </div>
  );
}

const QUEUE_LABEL: Record<QueueItem["tone"], string> = { fail: "Failed", error: "Stopped", changes: "Changes requested", review: "Needs a person", waiting: "Waiting" };
const QUEUE_DOT: Record<QueueItem["tone"], string> = { fail: "bg-fail", error: "bg-muted-foreground", changes: "bg-review", review: "bg-review", waiting: "bg-pass" };

function Queue({ items, brandView, viewerId }: { items: QueueItem[]; brandView: boolean; viewerId: string }) {
  return (
    <Panel
      title="Needs attention"
      action={
        items.length ? (
          <span className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="font-mono tabular-nums">{items.length}</span>
            <Link href="/dashboard/reels" className="rounded-sm font-semibold hover:text-foreground">
              All Reels
            </Link>
          </span>
        ) : null
      }
    >
      {items.length ? (
        <ul>
          {items.slice(0, 6).map(({ reel, tone, reason }) => (
            <li key={reel.id} className="border-b border-border last:border-0">
              <Link href={`/dashboard/reels/${reel.id}`} className="row-hover flex items-center gap-3 px-4 py-2 sm:gap-4 sm:px-5">
                <ReelThumb reelId={reel.id} hasPoster={Boolean(reel.has_poster)} className="w-8 shrink-0 rounded-[4px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{reel.filename}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{reason}</span>
                </span>
                <span className="hidden w-32 shrink-0 truncate text-[13px] text-muted-foreground md:block">{brandView ? (reel.owner_id === viewerId ? "Your team" : reel.owner_name) : (reel.brand_name ?? "Not sent")}</span>
                <span className="flex w-[108px] shrink-0 items-center gap-1.5 text-[12.5px] font-semibold sm:w-[120px]">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", QUEUE_DOT[tone])} />
                  <span className="truncate">{QUEUE_LABEL[tone]}</span>
                </span>
                <ChevronRight size={15} aria-hidden="true" className="hidden shrink-0 text-muted-foreground sm:block" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing is waiting on you.</p>
      )}
    </Panel>
  );
}

function Activity({ overview }: { overview: Overview }) {
  return (
    <Panel title="Recent activity">
      <ol className="py-1.5">
        {overview.activity.map((item) => (
          <li key={`${item.reelId}-${item.at}-${item.did}`}>
            <Link href={`/dashboard/reels/${item.reelId}`} className="row-hover grid gap-0.5 px-5 py-2">
              <span className="truncate text-[13.5px] font-semibold">{item.filename}</span>
              <span className="flex items-baseline justify-between gap-3 text-[12.5px] text-muted-foreground">
                <span className="min-w-0 truncate">
                  {item.who} {item.did}
                </span>
                <span className="shrink-0 tabular-nums">{when(item.at)}</span>
              </span>
            </Link>
          </li>
        ))}
        {!overview.activity.length ? <li className="px-5 py-3 text-sm text-muted-foreground">Nothing yet.</li> : null}
      </ol>
    </Panel>
  );
}

/** A new account: one thing to do, and nothing pretending there's data yet. */
function NextStep({ viewer }: { viewer: Member }) {
  const brand = viewer.brand;
  return (
    <section aria-labelledby="next-step" className="flex flex-col gap-5 rounded-[10px] bg-foreground p-6 text-background sm:flex-row sm:items-center sm:gap-7 sm:p-8">
      <span className="hidden shrink-0 sm:block [&_canvas]:[image-rendering:pixelated]">
        <Tick size={96} mood="hi" lcd="3s" outlined />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="next-step" className="text-[24px] leading-tight font-bold tracking-[-0.02em]">
          Check your first Reel
        </h2>
        <p className="mt-1.5 max-w-[56ch] text-[15px] text-background/75">
          {brand
            ? `Drop in a Reel made for ${brand.name}. Mr Tickle reads every frame and times its ad label against ASCI's rule.`
            : "Drop in a Reel. Mr Tickle reads every frame, times its ad label against ASCI's rule and tells you what to change."}
        </p>
      </div>
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/dashboard/check">
          <Upload size={18} aria-hidden="true" />
          Check a Reel
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

async function CreatorsPanel({ brandId, code }: { brandId: string; code: string }) {
  const creators = await brandCreators(brandId);
  return (
    <Panel title="Your creators" action={<Link href="/dashboard/connections" className="rounded-sm text-[13px] font-semibold text-muted-foreground hover:text-foreground">Manage</Link>}>
      <div className="grid gap-3 p-5">
        <p className="text-sm text-muted-foreground">Send creators this link. Once they join, they can send you Reels they&rsquo;ve checked.</p>
        <CopyLink url={`${await siteOrigin()}/join/${code}`} />
      </div>
      <ul className="border-t border-border">
        {creators.slice(0, 5).map((c) => (
          <li key={c.creator_id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-sm last:border-0">
            <span className="min-w-0 truncate font-semibold">{c.display_name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{c.reels_sent} sent</span>
          </li>
        ))}
        {!creators.length ? <li className="px-5 py-3 text-sm text-muted-foreground">No creators yet.</li> : null}
      </ul>
    </Panel>
  );
}

async function BrandsPanel({ creatorId }: { creatorId: string }) {
  const brands = await creatorBrands(creatorId);
  return (
    <Panel title="Your brands" action={<Link href="/dashboard/connections" className="rounded-sm text-[13px] font-semibold text-muted-foreground hover:text-foreground">Manage</Link>}>
      <ul>
        {brands.slice(0, 6).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-sm last:border-0">
            <span className="min-w-0 truncate font-semibold">{b.brand_name}</span>
            <span className="shrink-0 text-muted-foreground">{b.brand_id ? `${b.reels_sent} sent` : "Invite waiting"}</span>
          </li>
        ))}
      </ul>
      {!brands.length ? (
        <div className="grid gap-3 p-5 text-sm text-muted-foreground">
          <p>Connect the brands you make Reels for, and send them your checked Reels from here.</p>
          <Button asChild size="compact" variant="outline" className="justify-self-start">
            <Link href="/dashboard/connections">Connect a brand</Link>
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}

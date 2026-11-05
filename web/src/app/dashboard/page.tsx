import { Upload } from "lucide-react";
import Link from "next/link";
import { BrandKitPanel } from "@/components/account/brand-kit-panel";
import { CopyLink } from "@/components/account/copy-link";
import { EmptyState, Notice, PageHeader, Panel, ReelTable } from "@/components/account/bits";
import { Tick } from "@/components/landing/tick";
import { Button } from "@/components/ui/button";
import { brandCreators, creatorBrands, reelsFor, requireMember, siteOrigin, type Member } from "@/lib/account";
import { brandKits } from "@/lib/brand-kit";

export const metadata = { title: "Overview" };
// Reading the brand kit runs after the "Read brand kit" response, inside this page's function.
export const maxDuration = 300;

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireMember("/dashboard");
  const query = await searchParams;
  const welcome = query.welcome === "1";
  const reels = await reelsFor(viewer);
  const done = reels.filter((r) => r.status === "done");
  const passed = done.filter((r) => r.verdict === "PASS").length;
  const brand = viewer.brand;

  const stats = brand
    ? [
        { label: "Reels in your folder", value: reels.length },
        { label: "Sent by creators", value: reels.filter((r) => r.sent_at).length },
        { label: "Passed", value: passed },
        { label: "Need a fix", value: done.length - passed },
      ]
    : [
        { label: "Reels checked", value: done.length },
        { label: "Passed", value: passed },
        { label: "Need a fix", value: done.length - passed },
        { label: "Sent to brands", value: reels.filter((r) => r.sent_at).length },
      ];

  return (
    <div className="grid gap-6">
      {welcome ? <Welcome viewer={viewer} /> : null}
      {typeof query.error === "string" ? <Notice tone="fail">{query.error}</Notice> : null}
      <PageHeader
        title={brand ? brand.name : `Hi, ${viewer.profile.display_name.split(" ")[0]}`}
        description={brand ? `${brand.website.replace(/^https:\/\//, "")} · your brand folder` : "Check a Reel before it goes anywhere, then send the passing ones to your brands."}
        action={
          <Button asChild size="compact">
            <Link href="/dashboard/check">
              <Upload size={16} aria-hidden="true" />
              Check a Reel
            </Link>
          </Button>
        }
      />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[10px] border border-border bg-card px-4 py-3.5">
            <dt className="text-[13px] text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-[28px] leading-none font-bold tracking-[-0.03em] tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title={brand ? "Latest Reels" : "Your latest Reels"}
          action={
            reels.length ? (
              <Link href="/dashboard/reels" className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground">
                See all
              </Link>
            ) : null
          }
        >
          {reels.length ? (
            <ReelTable reels={reels.slice(0, 6)} brandView={brand !== null} />
          ) : (
            <EmptyState
              title={brand ? "Nothing in the folder yet" : "No Reels checked yet"}
              body={brand ? "Invite your creators. Reels they send you show up here, already checked." : "Drop in a Reel and Mr Tickle times its ad label against ASCI's rule."}
              action={
                <Button asChild size="compact" variant="outline">
                  <Link href={brand ? "/dashboard/connections" : "/dashboard/check"}>{brand ? "Invite creators" : "Check your first Reel"}</Link>
                </Button>
              }
            />
          )}
        </Panel>
        {brand ? (
          <div className="grid gap-6">
            <BrandKitPanel job={await brandKits.get(brand.id)} site={brand.website.replace(/^https:\/\/(www\.)?/, "")} />
            <CreatorsPanel brandId={brand.id} code={brand.invite_code} />
          </div>
        ) : (
          <BrandsPanel creatorId={viewer.user.id} />
        )}
      </div>
    </div>
  );
}

async function CreatorsPanel({ brandId, code }: { brandId: string; code: string }) {
  const creators = await brandCreators(brandId);
  return (
    <Panel title="Your creators" action={<Link href="/dashboard/connections" className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground">Manage</Link>}>
      <div className="grid gap-3 p-5">
        <p className="text-sm text-muted-foreground">Send creators this link. Once they join, they can send you Reels they&rsquo;ve checked.</p>
        <CopyLink url={`${await siteOrigin()}/join/${code}`} />
      </div>
      <ul className="border-t border-border">
        {creators.slice(0, 5).map((c) => (
          <li key={c.creator_id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
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
    <Panel title="Your brands" action={<Link href="/dashboard/connections" className="rounded-sm text-sm font-semibold text-muted-foreground hover:text-foreground">Manage</Link>}>
      <ul>
        {brands.slice(0, 6).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
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

/** Straight after the questionnaire: what this dashboard is for, in three steps. */
function Welcome({ viewer }: { viewer: Member }) {
  const steps = viewer.brand
    ? [
        { title: "Your folder is ready", body: `${viewer.brand.name} lives here. Every Reel your creators send lands in it, checked.` },
        { title: "Invite your creators", body: "Share your invite link. Creators who join can send you their checked Reels." },
        { title: "Check Reels yourself", body: "Got a Reel some other way? Check it here and it stays in your folder." },
      ]
    : [
        { title: "Check a Reel", body: "Drop it in. Mr Tickle reads every frame and times the ad label against ASCI's rule." },
        { title: "Fix what fails", body: "Each report says what's missing and what to change, down to the second." },
        { title: "Send it to the brand", body: "Connect your brands. They see your Reel and its report in their folder." },
      ];
  return (
    <section aria-labelledby="welcome-title" className="grid gap-5 rounded-[10px] bg-foreground p-6 text-background sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
      <span className="hidden sm:block [&_canvas]:[image-rendering:pixelated]">
        <Tick size={96} mood="hi" lcd="3s" outlined />
      </span>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="welcome-title" className="text-[22px] font-bold tracking-[-0.02em]">
            Welcome, {viewer.profile.display_name.split(" ")[0]}. Here&rsquo;s how this works.
          </h2>
          <Link href="/dashboard" className="rounded-sm text-sm font-semibold text-background/70 hover:text-background">
            Got it
          </Link>
        </div>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="grid gap-1">
              <span className="text-[13px] font-bold text-background/60 tabular-nums">0{i + 1}</span>
              <span className="text-[15px] font-bold">{s.title}</span>
              <span className="text-sm text-background/75">{s.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

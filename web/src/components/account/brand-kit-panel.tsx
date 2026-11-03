import { RefreshCw, Sparkles } from "lucide-react";
import { readBrandKitAction } from "@/app/dashboard/actions";
import { Notice, Panel } from "@/components/account/bits";
import { AutoRefresh } from "@/components/auto-refresh";
import { KitSummary } from "@/components/details/kit-summary";
import { Button } from "@/components/ui/button";
import type { BrandKitData } from "@/lib/brand-kit";
import type { Job } from "@/lib/jobs";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The brand folder's kit on the overview: read automatically when the folder is made, again on request. */
export function BrandKitPanel({ job, site }: { job: Job<BrandKitData> | null; site: string }) {
  const reading = job?.status === "reading";
  const kit = job?.data ?? null;
  const read = (label: string, icon: React.ReactNode) => (
    <form action={readBrandKitAction}>
      <Button type="submit" size="compact-sm" variant="outline" disabled={reading}>
        {icon}
        {label}
      </Button>
    </form>
  );

  return (
    <Panel title="Brand kit" action={kit && !reading ? read("Read again", <RefreshCw size={14} aria-hidden="true" />) : null}>
      {reading ? <AutoRefresh /> : null}
      {kit ? (
        <div className={reading ? "opacity-60" : undefined}>
          <KitSummary brand={kit} />
          {kit.products.length ? (
            <p className="px-5 pb-4 text-[13px] text-muted-foreground">Looks for: {kit.products.slice(0, 6).join(", ")}</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 border-t border-border px-5 py-3 text-[13px] text-muted-foreground first:border-t-0">
        {reading ? (
          <p role="status">Reading {site} and searching the web for its logo, colours and type, and what people say about it. About a minute.</p>
        ) : job?.status === "error" ? (
          <>
            <Notice tone="fail">The brand kit couldn&rsquo;t be read: {job.error}</Notice>
            {read("Try again", <RefreshCw size={14} aria-hidden="true" />)}
          </>
        ) : kit ? (
          <p>
            Read from {site} and {new Set(kit.mentions.map((m) => m.source.url)).size} other sources on {DAY.format(new Date(`${kit.read_at}T12:00:00Z`))}.
            Finer details draw their fixes in these colours.
          </p>
        ) : (
          <>
            <p>Read {site}&rsquo;s logo, colours and type, and what people say about it, so finer details can check Reels against your brand.</p>
            {read("Read brand kit", <Sparkles size={14} aria-hidden="true" />)}
          </>
        )}
      </div>
    </Panel>
  );
}

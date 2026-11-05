import { Tick } from "@/components/landing/tick";
import { StatusBadge } from "@/components/status-badge";
import type { ReelRow } from "@/lib/account";
import { cn } from "@/lib/utils";

// The dashboard's shared pieces: page header, panels, a Reel's status, empty states.

const DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
export const when = (iso: string) => DATE.format(new Date(iso));

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.03em]">{title}</h1>
        {description ? <p className="mt-1 max-w-[580px] text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[10px] border border-border bg-card", className)}>
      <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Notice({ tone = "pass", children }: { tone?: "pass" | "fail"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "fail" ? "alert" : "status"}
      className={cn("rounded-[6px] px-3.5 py-2.5 text-sm font-semibold", tone === "pass" ? "bg-pass-surface text-pass-text" : "bg-fail-surface text-fail-text")}
    >
      {children}
    </p>
  );
}

/** solid: for on top of a thumbnail, where a soft tint would disappear into the picture. */
export function ReelStatus({ reel, solid }: { reel: Pick<ReelRow, "status" | "verdict">; solid?: boolean }) {
  const tone = solid ? "solid" : "soft";
  if (reel.status === "checking") return <StatusBadge status="running" tone={tone} size="sm" />;
  if (reel.status === "error" || !reel.verdict) {
    return <span className="inline-flex h-6 items-center rounded-[4px] bg-muted px-2 text-[12px] font-semibold text-muted-foreground">Didn&rsquo;t finish</span>;
  }
  return <StatusBadge status={reel.verdict === "PASS" ? "pass" : reel.verdict === "FAIL" ? "fail" : "review"} tone={tone} size="sm" />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="[&_canvas]:[image-rendering:pixelated]">
        <Tick size={64} mood="sleep" />
      </span>
      <p className="text-[15px] font-bold">{title}</p>
      <p className="max-w-[340px] text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

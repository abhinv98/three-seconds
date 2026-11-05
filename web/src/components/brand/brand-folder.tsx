"use client";

import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { readBrandKitAction } from "@/app/dashboard/actions";
import { Notice } from "@/components/account/bits";
import { StippleLogo } from "@/components/brand/stipple-logo";
import { Button } from "@/components/ui/button";
import type { BrandKitData, KitStep } from "@/lib/brand-kit";
import type { Source } from "@/lib/brand-research";

const POLL_MS = 1500;

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const clockText = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;

export interface BrandFolderProps {
  brandId: string;
  site: string;
  status: "none" | "reading" | "done" | "error";
  kit: BrandKitData | null;
  /** The kit's colours mixed as paint, already a CSS background (lib/paint.ts). */
  band: string | null;
  error: string | null;
  startedAt: string | null;
  steps: KitStep[];
  readOnly: boolean;
}

function ReadButton({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <form action={readBrandKitAction}>
      <Button type="submit" size="compact-sm" variant="outline" disabled={disabled}>
        {children}
      </Button>
    </form>
  );
}

export function BrandFolder({ brandId, site, status, kit, band, error, startedAt, steps, readOnly }: BrandFolderProps) {
  return (
    <section aria-label="Brand kit" className="@container min-w-0 rounded-[10px] border border-border bg-card">
      <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-5 py-2">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">Brand kit</h2>
        {kit && status !== "reading" && !readOnly ? (
          <ReadButton>
            <RefreshCw size={13} aria-hidden="true" />
            Read again
          </ReadButton>
        ) : null}
      </header>
      {status === "reading" ? (
        <Reading site={site} startedAt={startedAt} initialSteps={steps} />
      ) : kit ? (
        <>
          <KitView key={startedAt ?? kit.read_at} brandId={brandId} kit={kit} band={band} shownKey={startedAt ?? kit.read_at} />
          {status === "error" ? (
            <div className="border-t border-border px-5 py-3">
              <Notice tone="fail">The last read didn&rsquo;t finish: {error}</Notice>
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid justify-items-start gap-3 px-5 py-4 text-sm text-muted-foreground">
          {status === "error" ? <Notice tone="fail">The brand kit couldn&rsquo;t be read: {error}</Notice> : null}
          <p className="max-w-[64ch]">Read {site}&rsquo;s logo, colours and type, and what people say about it, so finer details can check Reels against your brand.</p>
          {readOnly ? null : (
            <ReadButton>
              {status === "error" ? <RefreshCw size={13} aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
              {status === "error" ? "Try again" : "Read brand kit"}
            </ReadButton>
          )}
        </div>
      )}
    </section>
  );
}

/** While the kit is read: the real clock and the real steps as the read reports them. */
function Reading({ site, startedAt, initialSteps }: { site: string; startedAt: string | null; initialSteps: KitStep[] }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const clock = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const started = startedAt ? Date.parse(startedAt) : Date.now();
    const tick = () => {
      if (clock.current) clock.current.textContent = clockText(Math.max(0, (Date.now() - started) / 1000));
    };
    tick();
    const clockTimer = window.setInterval(tick, 250);
    const pollTimer = window.setInterval(async () => {
      const response = await fetch("/api/brand-kit", { cache: "no-store" }).catch(() => null);
      const body = (await response?.json().catch(() => null)) as { status?: string; steps?: KitStep[] } | null;
      if (!body?.status) return;
      if (body.steps) setSteps(body.steps);
      if (body.status !== "reading") {
        window.clearInterval(pollTimer);
        // The new kit stays at the top of the overview, where this read has been watched.
        router.replace("/dashboard?kit=new");
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(clockTimer);
      window.clearInterval(pollTimer);
    };
  }, [router, startedAt]);

  return <ReadingBody site={site} steps={steps} clock={clock} />;
}

/** The view itself, also shown by the questionnaire the moment a website is entered. */
export function ReadingBody({ site, steps, clock }: { site: string; steps: KitStep[]; clock?: React.Ref<HTMLSpanElement> }) {
  const shown = steps.length ? steps : [{ s: 0, text: `Starting on ${site}` }];
  return (
    <div className="grid gap-5 p-5 @xl:grid-cols-[208px_minmax(0,1fr)] @xl:gap-6">
      <div className="kit-plate kit-plate-waiting" aria-hidden="true">
        <span className="px-3 text-center font-mono text-[12px] break-all text-muted-foreground">{site}</span>
      </div>
      <div className="grid content-start gap-3" role="status">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[22px] leading-tight font-bold tracking-[-0.02em]">Reading {site}</p>
          <span ref={clock} className="shrink-0 font-mono text-[22px] leading-none font-medium tabular-nums">
            00:00
          </span>
        </div>
        <ol className="grid gap-1 text-[13.5px]">
          {shown.map((step, i) => (
            <li key={`${step.s}-${step.text}`} data-current={i === shown.length - 1 || undefined} className="kit-step grid grid-cols-[42px_minmax(0,1fr)] gap-2">
              <span className="font-mono text-[12px] leading-[20px] text-muted-foreground tabular-nums">{clockText(step.s)}</span>
              <span className="min-w-0 leading-5 break-words text-muted-foreground">
                {step.text}
                {step.colors?.length ? (
                  <span aria-hidden="true" className="ml-2 inline-flex translate-y-[1px] gap-0.5">
                    {step.colors.map((hex) => (
                      <span key={hex} className="size-3 rounded-[2px] border border-black/15" style={{ background: hex }} />
                    ))}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-muted-foreground">This takes about a minute. It carries on if you leave this page.</p>
      </div>
    </div>
  );
}

function KitView({ brandId, kit, band, shownKey }: { brandId: string; kit: BrandKitData; band: string | null; shownKey: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);

  // The reveal plays once per read, when the panel is first on screen, and the finished state shows every other time.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const key = `ts-kit-shown:${brandId}:${shownKey}`;
    let seen = true;
    try {
      seen = localStorage.getItem(key) !== null;
    } catch {
      // No storage, no reveal.
    }
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.reveal = "done";
      return;
    }
    let timer = 0;
    const seenOnScreen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        seenOnScreen.disconnect();
        try {
          localStorage.setItem(key, "1");
        } catch {
          // Shown again next time, then.
        }
        el.dataset.reveal = "play";
        setPlay(true);
        timer = window.setTimeout(() => {
          el.dataset.reveal = "on";
        }, 420);
      },
      { threshold: 0.25 },
    );
    seenOnScreen.observe(el);
    return () => {
      seenOnScreen.disconnect();
      window.clearTimeout(timer);
    };
  }, [brandId, shownKey]);

  const sources = new Set(kit.mentions.map((m) => m.source.url)).size;
  const good = kit.mentions.filter((m) => m.tone === "good").slice(0, 3);
  const watch = kit.mentions.filter((m) => m.tone === "watch").slice(0, 3);

  return (
    <div ref={root} data-reveal="wait" className="kit">
      <div className="grid gap-5 p-5 @xl:grid-cols-[208px_minmax(0,1fr)] @xl:gap-6">
        {kit.logo ? (
          <StippleLogo src={kit.logo} name={kit.name} play={play} />
        ) : (
          <div className="kit-plate kit-plate-waiting">
            <span className="text-[56px] font-bold text-muted-foreground">{kit.name.slice(0, 1).toUpperCase()}</span>
            <span className="absolute inset-x-0 bottom-2 text-center text-[12px] text-muted-foreground">No logo found</span>
          </div>
        )}
        <div className="grid min-w-0 content-start gap-3">
          <div data-rise="" style={{ "--d": 0 } as React.CSSProperties}>
            <p className="text-[24px] leading-tight font-bold tracking-[-0.02em]">{kit.name}</p>
            {kit.tagline ? <p className="text-[15px] text-muted-foreground">{kit.tagline}</p> : null}
          </div>
          {kit.summary ? (
            <p data-rise="" style={{ "--d": 70 } as React.CSSProperties} className="max-w-[72ch] text-[15px] leading-[1.45]">
              {kit.summary}
            </p>
          ) : null}
          {band ? <div aria-hidden="true" className="kit-band h-5 rounded-[3px]" style={{ background: band }} /> : null}
          <ul aria-label="Colours" className="flex flex-wrap gap-2.5">
            {kit.colors.map((color, i) => (
              <li key={color.hex} className="kit-swatch w-[96px]" style={{ "--d": 180 + i * 70 } as React.CSSProperties}>
                <span className="block h-11 rounded-[4px] border border-black/15" style={{ background: color.hex }} />
                <span className="mt-1 block font-mono text-[12px] leading-4">{color.hex}</span>
                <span className="block truncate text-[12px] leading-4 text-muted-foreground" title={color.name}>
                  {color.name}
                </span>
              </li>
            ))}
          </ul>
          <dl data-rise="" style={{ "--d": 420 } as React.CSSProperties} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Type</dt>
            <dd>{kit.fonts.join(", ") || "Not found"}</dd>
            {kit.products.length ? (
              <>
                <dt className="text-muted-foreground">Looks for</dt>
                <dd>{kit.products.slice(0, 6).join(", ")}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </div>
      {good.length || watch.length ? (
        <div className="grid border-t border-border @xl:grid-cols-2">
          <Mentions title="In its favour" items={good} delay={480} />
          <Mentions title="To watch" items={watch} delay={560} className="border-t border-border @xl:border-t-0 @xl:border-l" />
        </div>
      ) : null}
      <p data-rise="" style={{ "--d": 640 } as React.CSSProperties} className="border-t border-border px-5 py-2.5 text-[12.5px] text-muted-foreground">
        Read from {kit.site} and {sources} other {sources === 1 ? "source" : "sources"} on {DAY.format(new Date(`${kit.read_at}T12:00:00Z`))}. Finer details draw their fixes in these colours.
      </p>
    </div>
  );
}

function Mentions({ title, items, delay, className }: { title: string; items: { text: string; source: Source }[]; delay: number; className?: string }) {
  if (!items.length) return null;
  return (
    <section data-rise="" style={{ "--d": delay } as React.CSSProperties} className={`grid content-start gap-2.5 px-5 py-4 ${className ?? ""}`}>
      <h3 className="text-[13px] font-bold">{title}</h3>
      <ul className="grid gap-3">
        {items.map((item) => (
          <li key={item.text} className="text-[13.5px] leading-[1.4]">
            {item.text}{" "}
            <a href={item.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-sm whitespace-nowrap text-muted-foreground underline underline-offset-2 hover:text-foreground">
              {item.source.name}
              {item.source.date ? `, ${item.source.date}` : ""}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SAFE_SPOT, SIZES, textColourOn } from "@/app/dashboard/tools/label";
import { PrintButton } from "@/app/brief/[code]/print-button";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { brandByCode, siteOrigin } from "@/lib/account";
import { asciClause, ASCI_SOURCE_URL, formatHold, requiredHold } from "@/lib/asci";
import { schemaReady } from "@/lib/auth";
import { brandKits, fontCss } from "@/lib/brand-kit";
import type { Source } from "@/lib/brand-research";
import { LABEL_WORDS } from "@/lib/caption";
import { get } from "@/lib/db";
import { CLEAR_OF_UI } from "@/lib/details";
import { requireWritableBrand, SAMPLE, SAMPLE_BANNER } from "@/lib/sample";
import { cn } from "@/lib/utils";

// Public, from a brand's invite code: what a creator needs before they film. Rendered only from what's listed here, so
// nothing about the account behind the brand reaches the page. Always on paper, because it gets printed.

export const metadata: Metadata = {
  title: "Creator brief",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

const LENGTHS = [15, 30, 45, 60, 90];
/** Words a creator reaches for that 1.3a doesn't list. */
const NOT_ON_THE_LIST = ["Partner", "Collab", "Gifted", "PR", "Promo"];
const QUALIFIED_CATEGORY = /finance|health/i;
const READ_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const shortCode = (code: string) => code.replace("ASCI-IG ", "");

function Clause({ code }: { code: string }) {
  return (
    <p className="text-[13px] text-pretty text-muted-foreground">
      <span className="font-mono text-foreground">{shortCode(code)}</span> &ldquo;{asciClause(code).text}&rdquo;
    </p>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid content-start gap-3 border-t border-foreground pt-4 break-inside-avoid print:gap-1.5 print:pt-2 print:[&_p]:text-[12px] print:[&_td]:py-0.5 print:[&_td]:text-[12px] print:[&_li]:text-[12px]", className)}>
      <h2 className="text-[20px] font-bold tracking-[-0.02em] print:text-[15px]">{title}</h2>
      {children}
    </section>
  );
}

function SourceLink({ source }: { source: Source }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="rounded-xs text-[13px] whitespace-nowrap text-muted-foreground underline underline-offset-2">
      {source.name}
      {source.date ? `, ${source.date}` : ""}
    </a>
  );
}

export default async function BriefPage({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  await schemaReady();
  const { code } = await params;
  const brand = await brandByCode(code);
  if (!brand) notFound();
  const [job, owner, sealed, origin] = await Promise.all([
    brandKits.get(brand.id),
    get<{ is_sample: number }>(`SELECT email = ? AS is_sample FROM "user" WHERE id = ?`, SAMPLE.email, brand.owner_id),
    requireWritableBrand(brand.id),
    siteOrigin(),
  ]);
  const kit = job?.data ?? null;
  const name = kit?.name || brand.name;
  const site = kit?.site || brand.website.replace(/^https?:\/\//, "");
  const hexes = kit?.colors.map((colour) => colour.hex) ?? [];
  const accent = hexes[0] ?? "#121212";
  const onAccent = textColourOn(accent, hexes);
  const font = [...(kit?.fonts ?? []).map((family) => `"${family.replace(/["\\]/g, "")}"`), "var(--font-sans)"].join(", ");
  const good = kit?.mentions.filter((mention) => mention.tone === "good") ?? [];
  const watch = kit?.mentions.filter((mention) => mention.tone === "watch") ?? [];
  const joinUrl = `${origin}/join/${encodeURIComponent(code)}`;

  return (
    <div data-theme="light" className="min-h-dvh bg-background text-foreground print:min-h-0 print:bg-white">
      <style>{"@page { size: A4; margin: 12mm; } @media print { html, body { background: #fff !important; } }"}</style>
      {kit?.web_fonts.map((family) => (
        <link key={family} rel="stylesheet" href={fontCss(family)} precedence="default" />
      ))}
      {owner?.is_sample ? <p className="bg-foreground px-4 py-2 text-center text-[13px] font-semibold text-background [print-color-adjust:exact]">{SAMPLE_BANNER}</p> : null}

      <main id="main" className="mx-auto grid max-w-[860px] gap-9 px-4 pt-6 pb-16 sm:px-6 sm:pt-10 print:max-w-none print:gap-3 print:p-0">
        <header className="grid gap-5 print:gap-2">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="Three Seconds, home" className="-mx-1 rounded-sm px-1 py-1">
              <Logo size={18} />
            </Link>
            <PrintButton />
          </div>
          <div className="flex items-center gap-4">
            {kit?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={kit.logo} alt="" width={64} height={64} className="size-16 shrink-0 rounded-[10px] bg-card object-contain [print-color-adjust:exact] print:size-11" />
            ) : null}
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-muted-foreground">Creator brief</p>
              <h1 className="text-[38px] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance sm:text-[52px] print:text-[32px]">{name}</h1>
              <p className="mt-1 text-[15px] text-pretty text-muted-foreground">
                {kit?.tagline ? `${kit.tagline} · ` : ""}
                {site}
              </p>
            </div>
          </div>
          <p className="max-w-[60ch] text-[19px] leading-snug font-semibold text-pretty print:text-[15px]">
            If {name} gave you anything for this Reel, say so on screen, in a word ASCI allows, from the first frame, for as long as the table below says.
          </p>
          {kit ? null : <p className="text-sm text-muted-foreground">{name} hasn&rsquo;t read its brand kit yet, so this brief has the rules and not the colours, type or research.</p>}
        </header>

        <Section title="The label to use">
          <div className="grid gap-6 sm:grid-cols-[150px_minmax(0,1fr)] print:grid-cols-[100px_minmax(0,1fr)] print:gap-4">
            <figure className="grid content-start gap-1.5">
            <div className="@container relative aspect-[9/16] w-[150px] overflow-hidden rounded-[8px] bg-viewer-plate [print-color-adjust:exact] print:w-[100px]" role="img" aria-label="Where the label goes on a Reel: clear of Instagram's top bar, caption and buttons">
              {[
                { left: 0, right: 0, top: 0, height: `${CLEAR_OF_UI.y0 * 100}%` },
                { left: 0, right: 0, bottom: 0, height: `${(1 - CLEAR_OF_UI.y1) * 100}%` },
                { right: 0, top: `${CLEAR_OF_UI.y0 * 100}%`, bottom: `${(1 - CLEAR_OF_UI.y1) * 100}%`, width: `${(1 - CLEAR_OF_UI.x1) * 100}%` },
              ].map((style, i) => (
                <div key={i} className="absolute" style={{ ...style, backgroundImage: "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.2) 0 1px, transparent 1px 6px)" }} />
              ))}
              <span
                className="absolute inline-flex items-center rounded-[0.16em] px-[0.55em] font-bold whitespace-nowrap"
                style={{ left: `${SAFE_SPOT.x * 100}%`, top: `${SAFE_SPOT.y * 100}%`, height: "1.7em", fontSize: `${(SIZES.M / 1080) * 100}cqw`, background: accent, color: onAccent, fontFamily: font }}
              >
                Paid partnership
              </span>
            </div>
            <figcaption className="text-[12px] text-muted-foreground print:hidden">The label to scale. Hatched: where Instagram draws.</figcaption>
            </figure>
            <div className="grid content-start gap-3 print:gap-1.5">
              <div className="flex flex-wrap gap-2">
                {LABEL_WORDS.map((word) => (
                  <span key={word} className="inline-flex h-9 items-center rounded-[6px] px-3 text-[15px] font-bold [print-color-adjust:exact] print:h-6 print:px-2 print:text-[12px]" style={{ background: accent, color: onAccent, fontFamily: font }}>
                    {word}
                  </span>
                ))}
              </div>
              <Clause code="ASCI-IG 1.3a" />
              <p className="text-[15px] text-pretty">
                Not on the list:{" "}
                {NOT_ON_THE_LIST.map((word, i) => (
                  <span key={word}>
                    {i ? ", " : ""}
                    <s>{word}</s>
                  </span>
                ))}
                . #BrandPartner doesn&rsquo;t count, and #BrandPartnership does.
              </p>
              <p className="text-[15px] text-pretty">Keep it out of the top 10%, the bottom 22% and the right 14% of the frame, where Instagram draws over the Reel. These zones are a guide.</p>
              <Clause code="ASCI-IG 1.3b" />
              {brand.category && QUALIFIED_CATEGORY.test(brand.category) ? (
                <div className="grid gap-1 rounded-[6px] border border-foreground p-3">
                  <p className="text-[15px] font-semibold text-pretty">{name} is in {brand.category.toLowerCase()}, so this applies as well: state your qualifications upfront.</p>
                  <Clause code="ASCI-IG Addendum II" />
                </div>
              ) : null}
            </div>
          </div>
        </Section>

        <Section title="How long it holds">
          <table className="w-full max-w-[520px] text-[15px]">
            <thead>
              <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
                <th scope="col" className="py-1.5 font-semibold">Reel length</th>
                <th scope="col" className="py-1.5 font-semibold">Label on screen, in one stretch</th>
                <th scope="col" className="py-1.5 text-right font-semibold">Clause</th>
              </tr>
            </thead>
            <tbody>
              {LENGTHS.map((length, i) => {
                const hold = requiredHold(length);
                return (
                  <tr key={length} className="border-b border-border">
                    <td className="py-1.5 font-mono tabular-nums">{length}s{i === 0 ? " or less" : ""}</td>
                    <td className="py-1.5 font-mono font-bold tabular-nums">{formatHold(hold.seconds)}</td>
                    <td className="py-1.5 text-right font-mono text-[13px] text-muted-foreground">{shortCode(hold.clause.code)}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-border">
                <td className="py-1.5 font-mono">2 min or more</td>
                <td className="py-1.5 font-bold">The whole section where the brand comes up</td>
                <td className="py-1.5 text-right font-mono text-[13px] text-muted-foreground">1.2e.III</td>
              </tr>
            </tbody>
          </table>
          <div className="grid gap-1">
            <Clause code="ASCI-IG 1.2e.I" />
            <Clause code="ASCI-IG 1.2e.II" />
            <Clause code="ASCI-IG 1.2e.III" />
          </div>
        </Section>

        <Section title="In the caption">
          <ul className="grid list-disc gap-1 pl-4 text-[15px] text-pretty">
            <li>Put the word in the first line, before Instagram&rsquo;s &ldquo;more&rdquo;.</li>
            <li>Keep it out of the pile of hashtags at the end.</li>
            <li>Turn on Instagram&rsquo;s Paid partnership tag when you post. It&rsquo;s added at posting, so it isn&rsquo;t in your video file: the label on screen still counts on its own.</li>
          </ul>
          <div className="grid gap-1">
            <Clause code="ASCI-IG 1.2" />
            <Clause code="ASCI-IG 1.2b" />
            <Clause code="ASCI-IG 1.2c" />
            <Clause code="ASCI-IG 1.2d" />
          </div>
        </Section>

        {kit ? (
          <Section title="Colours and type">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kit.colors.map((colour) => (
                <li key={colour.hex} className="grid gap-1.5">
                  <span className="h-16 rounded-[6px] border border-foreground [print-color-adjust:exact] print:h-10" style={{ background: colour.hex }} />
                  <span className="text-sm font-semibold">{colour.name}</span>
                  <span className="font-mono text-[13px] text-muted-foreground">{colour.hex}</span>
                </li>
              ))}
            </ul>
            {kit.fonts.length ? (
              <ul className="flex flex-wrap gap-x-8 gap-y-1">
                {kit.fonts.map((family) => (
                  <li key={family} className="text-[26px] font-semibold print:text-[15px]!" style={{ fontFamily: `"${family.replace(/["\\]/g, "")}", var(--font-sans)` }}>
                    {family}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No typeface found in the kit. Use a plain, bold sans.</p>
            )}
          </Section>
        ) : null}

        <div className="grid gap-9 sm:grid-cols-2 print:grid-cols-2 print:gap-5">
          <Section title="Do">
            <ul className="grid content-start gap-2 text-[15px] text-pretty print:gap-1">
              <li>Start the label on the first frame and hold it for the time above.</li>
              {kit?.products.length ? <li>Name the product: {kit.products.slice(0, 6).join(", ")}.</li> : null}
              {kit?.colors.length ? <li>Set any text you add in {kit.colors[0].name} and {kit.colors.at(-1)?.name}{kit.fonts.length ? `, in ${kit.fonts[0]}` : ""}.</li> : null}
              {good.length ? <li className="mt-1 text-[13px] font-semibold text-muted-foreground">People already say this about {name}. Lean on it:</li> : null}
              {good.map((mention) => (
                <li key={mention.text}>
                  {mention.text} <SourceLink source={mention.source} />
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Don&rsquo;t">
            <ul className="grid content-start gap-2 text-[15px] text-pretty print:gap-1">
              <li>Write only &ldquo;Partner&rdquo; or &ldquo;Collab&rdquo; and call it disclosed.</li>
              <li>Leave the label for the end of the video, or only in your bio.</li>
              <li>Put it where Instagram&rsquo;s buttons or caption cover it.</li>
              {watch.length ? <li className="mt-1 text-[13px] font-semibold text-muted-foreground">People also say this about {name}. Don&rsquo;t feed it:</li> : null}
              {watch.map((mention) => (
                <li key={mention.text}>
                  {mention.text} <SourceLink source={mention.source} />
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {kit?.market ? (
          <Section title="Who it&rsquo;s for">
            <p className="max-w-[68ch] text-[15px] text-pretty">{kit.market}</p>
            {kit.market_sources.length ? (
              <p className="flex flex-wrap gap-x-3">
                {kit.market_sources.map((source) => (
                  <SourceLink key={source.url} source={source} />
                ))}
              </p>
            ) : null}
            <p className="text-[13px] text-muted-foreground">An estimate from public sources, not audience data.</p>
          </Section>
        ) : null}

        <Section title={sealed ? "Make your own" : `Work with ${name}`}>
          <p className="max-w-[60ch] text-[15px] text-pretty">
            {sealed
              ? "This folder is a sample, so it can't be joined. Make an account to run your own brand or check your own Reels."
              : `Join ${name}'s folder on Three Seconds. Check your Reel against these rules, frame by frame, before you send it.`}
          </p>
          <div className="print:hidden">
            <Button asChild>
              <Link href={sealed ? "/sign-in?mode=sign-up" : `/join/${encodeURIComponent(code)}`}>{sealed ? "Make an account" : `Join ${name}`}</Link>
            </Button>
          </div>
          {sealed ? null : <p className="hidden font-mono text-[13px] break-all print:block">{joinUrl}</p>}
        </Section>

        <footer className="border-t border-border pt-4 text-[13px] text-pretty text-muted-foreground break-inside-avoid">
          Rules quoted from{" "}
          <a href={ASCI_SOURCE_URL} target="_blank" rel="noreferrer" className="rounded-xs underline underline-offset-2">
            ASCI&rsquo;s Guidelines for Influencer Advertising in Digital Media
          </a>
          .{kit ? ` Colours, type and research read from ${kit.site} and the web on ${READ_DATE.format(new Date(`${kit.read_at}T12:00:00Z`))}.` : ""} This is not legal advice.
        </footer>
      </main>
    </div>
  );
}

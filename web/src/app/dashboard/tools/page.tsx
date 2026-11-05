import Link from "next/link";
import { PageHeader, Panel } from "@/components/account/bits";
import { CopyLink } from "@/components/account/copy-link";
import { Button } from "@/components/ui/button";
import { creatorBrands, requireMember, siteOrigin } from "@/lib/account";
import { brandKits, fontCss } from "@/lib/brand-kit";
import { HoldCalculator } from "./hold-calculator";
import { LabelMaker, type LabelKit } from "./label-maker";

export const metadata = { title: "Label maker" };

export default async function ToolsPage() {
  const viewer = await requireMember("/dashboard/tools");
  const brands = viewer.brand
    ? [{ id: viewer.brand.id, name: viewer.brand.name }]
    : (await creatorBrands(viewer.user.id)).flatMap((link) => (link.brand_id ? [{ id: link.brand_id, name: link.brand_name }] : []));
  const kits = (
    await Promise.all(
      brands.map(async ({ id, name }): Promise<LabelKit | null> => {
        const data = (await brandKits.get(id))?.data;
        return data ? { id, name: data.name || name, colors: data.colors, fonts: data.fonts, webFonts: data.web_fonts } : null;
      }),
    )
  ).filter((kit) => kit !== null);

  return (
    <div className="grid gap-6">
      {kits.flatMap((kit) => kit.webFonts).map((font) => (
        <link key={font} rel="stylesheet" href={fontCss(font)} precedence="default" />
      ))}
      <PageHeader title="Label maker" description="How long the label has to hold, and a label in the brand's colours and type to put on the Reel." />
      <HoldCalculator />
      <LabelMaker kits={kits} />
      {viewer.brand ? (
        <Panel title="Creator brief">
          <div className="grid gap-3 p-5">
            <p className="max-w-[68ch] text-sm text-pretty text-muted-foreground">
              A public page to send your creators before they film: the rules, the label, your colours and type, what to lean on and what to avoid, and a link to join. It prints on two pages.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[260px] flex-1">
                <CopyLink url={`${await siteOrigin()}/brief/${encodeURIComponent(viewer.brand.invite_code)}`} label="Creator brief link" />
              </div>
              <Button asChild size="compact">
                <Link href={`/brief/${encodeURIComponent(viewer.brand.invite_code)}`}>Open the brief</Link>
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

import { PageHeader } from "@/components/account/bits";
import { creatorBrands, requireMember } from "@/lib/account";
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
    </div>
  );
}

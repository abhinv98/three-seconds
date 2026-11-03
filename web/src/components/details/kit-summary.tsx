import type { BrandKit } from "@/lib/details";

/** The brand kit at a glance: logo, name, tagline, colours and type. */
export function KitSummary({ brand }: { brand: Pick<BrandKit, "name" | "tagline" | "logo" | "colors" | "fonts"> }) {
  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-4">
        {brand.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small data: URL saved with the kit; next/image adds nothing here
          <img src={brand.logo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-[8px] bg-muted object-contain" />
        ) : (
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-muted text-[18px] font-bold">
            {brand.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[15px] font-bold">{brand.name}</p>
          <p className="text-sm text-muted-foreground">{brand.tagline}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2.5 px-5 py-4 text-sm">
        <dt className="pt-0.5 text-[12px] text-muted-foreground">Colours</dt>
        <dd className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {brand.colors.map((c) => (
            <span key={c.hex} className="flex items-center gap-2" title={c.name}>
              <span className="size-4 shrink-0 rounded-[4px] border border-border" style={{ background: c.hex }} />
              <span className="font-mono text-[12px]">{c.hex}</span>
            </span>
          ))}
        </dd>
        <dt className="text-[12px] text-muted-foreground">Type</dt>
        <dd>{brand.fonts.join(" · ") || "Not found"}</dd>
      </dl>
    </>
  );
}

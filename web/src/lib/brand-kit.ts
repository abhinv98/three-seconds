import { researchBrand, type BrandResearch, type Source } from "@/lib/brand-research";
import { jobStore } from "@/lib/jobs";
import { safeFetch } from "@/lib/safe-fetch";
import { readSiteHints, type SiteHints } from "@/lib/site-hints";

// A brand folder's kit, read once when the folder is made and again on request: the homepage's own icons,
// colours and typefaces (lib/site-hints.ts), checked and filled in by web research (lib/brand-research.ts).
// The finer-details pass draws its fixes in these colours and explains them with this research.

export interface BrandKitData {
  name: string;
  /** The website's host, like grok.com. */
  site: string;
  tagline: string;
  /** The logo as a data: URL, or empty when none could be fetched. */
  logo: string;
  /** At least two; the accent first and the darkest last (the fixes are drawn in those two). */
  colors: { hex: string; name: string }[];
  fonts: string[];
  /** The fonts above that Google Fonts serves: the finer-details page loads these for its fixes. */
  web_fonts: string[];
  products: string[];
  market: string;
  market_sources: Source[];
  mentions: BrandResearch["mentions"];
  /** YYYY-MM-DD */
  read_at: string;
}

export const brandKits = jobStore<BrandKitData>("brand_kit", "brand_id", "kit");

const LOGO_BYTES = 400_000;

/** What the bytes are, from their first few, so an icon served as application/octet-stream still counts. */
function imageType(body: Buffer, declared: string): string | null {
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (body[0] === 0xff && body[1] === 0xd8) return "image/jpeg";
  if (body.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (body.subarray(0, 4).toString("latin1") === "RIFF" && body.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) return "image/x-icon";
  const head = body.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg")) || declared.startsWith("image/svg")) return "image/svg+xml";
  return null;
}

async function firstImage(candidates: string[]): Promise<string> {
  for (const url of new Set(candidates.filter(Boolean))) {
    const fetched = await safeFetch(url, { maxBytes: LOGO_BYTES, accept: "image/*" }).catch(() => null);
    const type = fetched ? imageType(fetched.body, fetched.contentType.toLowerCase()) : null;
    if (fetched && type) return `data:${type};base64,${fetched.body.toString("base64")}`;
  }
  return "";
}

/** Google Fonts' stylesheet for a family, the regular weight. */
export const fontCss = (family: string) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&display=swap`;

async function onGoogleFonts(fonts: string[]): Promise<string[]> {
  const served = await Promise.all(
    fonts.map((f) =>
      /^[A-Za-z0-9 ]{2,40}$/.test(f)
        ? safeFetch(fontCss(f), { maxBytes: 200_000, accept: "text/css", timeoutMs: 4000 }).then(
            () => f,
            () => null,
          )
        : null,
    ),
  );
  return served.filter((f): f is string => f !== null);
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const sixDigit = (hex: string | null | undefined) => {
  const h = (hex ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(h)) return h;
  if (/^#[0-9a-f]{3}$/.test(h)) return `#${[...h.slice(1)].map((c) => c + c).join("")}`;
  return null;
};

/** The research's colours (or the site's when it has none), deduplicated, with the darkest moved last. */
export function palette(colors: { hex: string; name: string }[], hints: SiteHints | null): { hex: string; name: string }[] {
  const raw = colors.length
    ? colors
    : [
        ...(sixDigit(hints?.themeColor) ? [{ hex: sixDigit(hints?.themeColor)!, name: "Theme" }] : []),
        ...(hints?.colors ?? []).slice(0, 2).map((c, i) => ({ hex: c.hex, name: i ? "Second colour" : "Accent" })),
      ];
  const list = [...new Map(raw.flatMap((c) => (sixDigit(c.hex) ? [[sixDigit(c.hex)!, { hex: sixDigit(c.hex)!, name: c.name }] as const] : []))).values()];
  if (!list.length || Math.min(...list.map((c) => luminance(c.hex))) > 0.15) list.push({ hex: "#111111", name: "Ink" });
  const darkest = list.reduce((d, c) => (luminance(c.hex) < luminance(d.hex) ? c : d));
  const rest = list.filter((c) => c !== darkest);
  if (!rest.length) rest.push({ hex: "#ffffff", name: "White" });
  return [...rest, darkest];
}

/** Reads the kit and saves it; never throws, a failure is saved on the row instead. Claim the row first. */
export async function buildBrandKit(brand: { id: string; name: string; website: string }) {
  try {
    const hints = await readSiteHints(brand.website).catch(() => null);
    const { research, costUsd } = await researchBrand(brand.name, brand.website, hints);
    const fonts = research.fonts.length ? research.fonts : (hints?.fonts.slice(0, 2) ?? []);
    const [logo, webFonts] = await Promise.all([firstImage([research.logo_url, ...(hints?.icons ?? [])]), onGoogleFonts(fonts)]);
    await brandKits.finish(
      brand.id,
      {
        name: research.name || brand.name,
        site: new URL(brand.website).hostname.replace(/^www\./, ""),
        tagline: research.tagline || hints?.description || "",
        logo,
        colors: palette(research.colors, hints),
        fonts,
        web_fonts: webFonts,
        products: research.products,
        market: research.market,
        market_sources: research.market_sources,
        mentions: research.mentions,
        read_at: new Date().toISOString().slice(0, 10),
      },
      costUsd,
    );
  } catch (error) {
    await brandKits.fail(brand.id, error);
  }
}

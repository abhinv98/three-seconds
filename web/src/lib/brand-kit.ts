import { researchBrand, type BrandResearch, type Source } from "@/lib/brand-research";
import { get, run } from "@/lib/db";
import { jobStore, STALE_MS } from "@/lib/jobs";
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
  /** Two or three sentences. Kits read before this existed don't have it. */
  summary?: string;
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

/** Claims a new read. Its log starts empty, or the panel would show the last read's steps under a clock back at zero. */
export async function claimKitRead(brandId: string): Promise<boolean> {
  if (!(await brandKits.claim(brandId))) return false;
  await run("UPDATE brand_kit SET progress = NULL WHERE brand_id = ?", brandId);
  return true;
}

const LOGO_BYTES = 400_000;
const MAX_STEPS = 24;

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

/** Width and height from a raster image's header. Null for SVG, or a file too short or odd to tell. */
export function imageSize(body: Buffer, type: string): { w: number; h: number } | null {
  try {
    if (type === "image/png") return { w: body.readUInt32BE(16), h: body.readUInt32BE(20) };
    if (type === "image/gif") return { w: body.readUInt16LE(6), h: body.readUInt16LE(8) };
    if (type === "image/x-icon") {
      // The directory lists every size in the file; a width byte of 0 means 256.
      let best = 0;
      for (let i = 0; i < body.readUInt16LE(4); i++) best = Math.max(best, body[6 + i * 16] || 256);
      return { w: best, h: best };
    }
    if (type === "image/webp") {
      const kind = body.subarray(12, 16).toString("latin1");
      if (kind === "VP8X") return { w: 1 + body.readUIntLE(24, 3), h: 1 + body.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { w: body.readUInt16LE(26) & 0x3fff, h: body.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") {
        const bits = body.readUInt32LE(21);
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    if (type === "image/jpeg") {
      for (let i = 2; i < body.length - 9; ) {
        if (body[i] !== 0xff) return null;
        const marker = body[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: body.readUInt16BE(i + 7), h: body.readUInt16BE(i + 5) };
        i += 2 + body.readUInt16BE(i + 2);
      }
    }
  } catch {
    // A truncated header: size unknown.
  }
  return null;
}

/** Sharp enough to show large on the brand folder's plate. */
const SHARP_PX = 96;

type Fetcher = (url: string, options: { maxBytes: number; accept: string }) => Promise<{ body: Buffer; contentType: string }>;

/**
 * The first candidate that's vector or sharp, else the largest one found. A site's social card is usually a banner with
 * words on it, so it only counts when it's about square, and only with nothing else to show.
 */
export async function bestLogo(candidates: string[], socialImage: string | null, fetcher: Fetcher = safeFetch): Promise<string> {
  let soft: { src: string; px: number } | null = null;
  const read = async (url: string) => {
    const fetched = await fetcher(url, { maxBytes: LOGO_BYTES, accept: "image/*" }).catch(() => null);
    const type = fetched ? imageType(fetched.body, fetched.contentType.toLowerCase()) : null;
    return fetched && type ? { type, body: fetched.body, src: `data:${type};base64,${fetched.body.toString("base64")}` } : null;
  };
  for (const url of new Set(candidates.filter(Boolean))) {
    const image = await read(url);
    if (!image) continue;
    if (image.type === "image/svg+xml") return image.src;
    const size = imageSize(image.body, image.type);
    const px = size ? Math.min(size.w, size.h) : 0;
    if (px >= SHARP_PX) return image.src;
    if (!soft || px > soft.px) soft = { src: image.src, px };
  }
  if (soft) return soft.src;
  if (socialImage) {
    const image = await read(socialImage);
    const size = image && imageSize(image.body, image.type);
    if (image && size && size.w / size.h > 0.8 && size.w / size.h < 1.25) return image.src;
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
export function palette(colors: { hex: string; name: string }[], hints: Pick<SiteHints, "themeColor" | "colors"> | null): { hex: string; name: string }[] {
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

export interface KitStep {
  /** Seconds since the read started. */
  s: number;
  text: string;
  /** Colours this step found, shown beside its line. */
  colors?: string[];
}

/** What a read is doing, for the brand folder while it waits: a light row with no kit in it, so it can be polled. */
export async function kitProgress(brandId: string): Promise<{ status: "reading" | "done" | "error"; started_at: string; steps: KitStep[]; error: string | null } | null> {
  const row = await get<{ status: "reading" | "done" | "error"; started_at: string; progress: string | null; error: string | null }>(
    "SELECT status, started_at, progress, error FROM brand_kit WHERE brand_id = ?",
    brandId,
  );
  if (!row) return null;
  const stale = row.status === "reading" && Date.now() - Date.parse(row.started_at) > STALE_MS;
  return {
    status: stale ? "error" : row.status,
    started_at: row.started_at,
    steps: row.progress ? (JSON.parse(row.progress) as KitStep[]) : [],
    error: stale ? "The read stopped before it finished." : row.error,
  };
}

/** The read itself, with nothing saved: hints from the site, the web research, then the logo and the fonts. */
export async function readBrandKit(brand: { name: string; website: string }, report: (text: string, colors?: string[]) => void = () => {}): Promise<{ kit: BrandKitData; costUsd: number }> {
  const site = new URL(brand.website).hostname.replace(/^www\./, "");
  // The research can run the same search twice; the log only says it once.
  const said = new Set<string>();
  const onStep = (text: string, colors?: string[]) => {
    if (!said.has(text)) report(text, colors);
    said.add(text);
  };
  onStep(`Reading ${site}'s homepage: its icons, theme colour and stylesheets`);
  const hints = await readSiteHints(brand.website).catch(() => null);
  onStep(
    hints
      ? `On the homepage: ${hints.icons.length} ${hints.icons.length === 1 ? "icon" : "icons"}, ${hints.colors.length} colours, ${hints.fonts.length} ${hints.fonts.length === 1 ? "typeface" : "typefaces"}`
      : `${site} doesn't let us read its homepage, so this comes from the web`,
    hints?.colors.slice(0, 8).map((c) => c.hex),
  );
  const { research, costUsd } = await researchBrand(brand.name, brand.website, hints, onStep);
  onStep("Fetching the logo and checking the type");
  const fonts = research.fonts.length ? research.fonts : (hints?.fonts.slice(0, 2) ?? []);
  const [logo, webFonts] = await Promise.all([bestLogo([research.logo_url, ...(hints?.icons ?? [])], hints?.socialImage ?? null), onGoogleFonts(fonts)]);
  return {
    kit: {
      name: research.name || brand.name,
      site,
      tagline: research.tagline || hints?.description || "",
      summary: research.summary,
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
  };
}

/** Reads the kit and saves it; never throws, a failure is saved on the row instead. Claim the row first. */
export async function buildBrandKit(brand: { id: string; name: string; website: string }) {
  const started = Date.now();
  const steps: KitStep[] = [];
  // Each step lands in its own write; a lost one only leaves the log a line short.
  let writes = Promise.resolve();
  const note = (text: string, colors?: string[]) => {
    steps.push({ s: Math.round((Date.now() - started) / 1000), text, colors });
    const progress = JSON.stringify(steps.slice(-MAX_STEPS));
    writes = writes.then(() => run("UPDATE brand_kit SET progress = ? WHERE brand_id = ?", progress, brand.id)).catch(() => {});
  };
  try {
    const { kit, costUsd } = await readBrandKit(brand, note);
    await writes;
    await brandKits.finish(brand.id, kit, costUsd);
  } catch (error) {
    await writes;
    console.error("Brand kit read failed", error);
    // The ones we wrote can be shown as they are. The SDK's can hold paths and request details.
    const message = error instanceof Error && error.message.startsWith("Claude ") ? error.message : "The web research stopped before it finished. Try again.";
    await brandKits.fail(brand.id, new Error(message));
  }
}

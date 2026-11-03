import { safeFetch } from "@/lib/safe-fetch";

// What a brand's own homepage says about its look, read straight from the HTML and CSS: the icons it serves,
// its theme colour, the colours and typefaces its stylesheets use most. These are hints for the research step,
// which checks them against the web; a site that blocks us just gives no hints.

export interface SiteHints {
  url: string;
  title: string;
  description: string;
  themeColor: string | null;
  /** Icon and logo images the page links, biggest first. */
  icons: string[];
  /** Hex colours by how often the page and its stylesheets use them, greys and pure white left out. */
  colors: { hex: string; uses: number }[];
  fonts: string[];
}

const PAGE_BYTES = 1_500_000;
const CSS_BYTES = 800_000;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function resolve(href: string, base: string): string | null {
  try {
    const url = new URL(decode(href), base);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** #abc and #aabbcc as #aabbcc, lowercase. */
function expand(hex: string) {
  const h = hex.slice(1).toLowerCase();
  return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
}

/** Saturation and lightness, 0-1, to drop greys. */
function satLight(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

const GENERIC_FONTS = new Set([
  "inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif",
  "ui-serif", "ui-monospace", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica", "helvetica neue",
  "arial", "noto sans", "apple color emoji", "segoe ui emoji", "segoe ui symbol", "noto color emoji", "emoji", "math",
  "times new roman", "courier new", "menlo", "monaco", "consolas", "liberation mono", "sf mono", "sfmono-regular",
]);

function countInto<K>(map: Map<K, number>, key: K, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

export async function readSiteHints(website: string): Promise<SiteHints | null> {
  const page = await safeFetch(website, { maxBytes: PAGE_BYTES, accept: "text/html" }).catch(() => null);
  if (!page || !page.contentType.includes("html")) return null;
  const html = page.body.toString("utf8");
  const base = page.url;

  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key: string) => {
    const m = metas.find((a) => (a.name ?? a.property ?? "").toLowerCase() === key);
    return m?.content ? decode(m.content) : "";
  };

  // Icons: the largest declared size first, an SVG counting as largest.
  const icons: { url: string; size: number }[] = [];
  for (const link of links) {
    const rel = (link.rel ?? "").toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed|mask-icon)(\s|$)/.test(rel) || !link.href) continue;
    const url = resolve(link.href, base);
    if (!url) continue;
    const size = /\.svg(\?|$)/i.test(url) ? 10_000 : Math.max(0, ...(link.sizes ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    icons.push({ url, size: size || (rel.includes("apple") ? 180 : 32) });
  }
  const manifestHref = links.find((l) => (l.rel ?? "").toLowerCase() === "manifest")?.href;
  let manifestTheme: string | null = null;
  if (manifestHref) {
    const url = resolve(manifestHref, base);
    const manifest = url ? await safeFetch(url, { maxBytes: 200_000 }).catch(() => null) : null;
    try {
      const json = manifest ? (JSON.parse(manifest.body.toString("utf8")) as { icons?: { src?: string; sizes?: string }[]; theme_color?: string }) : null;
      for (const icon of json?.icons ?? []) {
        const src = icon.src && url ? resolve(icon.src, url) : null;
        if (src) icons.push({ url: src, size: Math.max(0, ...(icon.sizes ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0)) });
      }
      manifestTheme = json?.theme_color ?? null;
    } catch {
      // Not JSON: no manifest hints.
    }
  }
  const ogImage = meta("og:image");
  if (ogImage) {
    const url = resolve(ogImage, base);
    if (url) icons.push({ url, size: 1 }); // a social card, usually not the logo: last resort
  }

  // Colours and typefaces: inline styles plus the first few stylesheets.
  let css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  css += "\n" + [...html.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";");
  const sheets = links
    .filter((l) => (l.rel ?? "").toLowerCase().split(/\s+/).includes("stylesheet") && l.href)
    .map((l) => resolve(l.href, base))
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);
  const fetched = await Promise.all(sheets.map((u) => safeFetch(u, { maxBytes: CSS_BYTES, accept: "text/css" }).catch(() => null)));
  css += "\n" + fetched.map((f) => f?.body.toString("utf8") ?? "").join("\n");

  const colors = new Map<string, number>();
  for (const m of (css + html).matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g)) countInto(colors, expand(m[0]));
  const themeColor = meta("theme-color") || manifestTheme;
  const palette = [...colors]
    .filter(([hex]) => {
      const { s, l } = satLight(hex);
      return s > 0.15 && l > 0.08 && l < 0.95;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex, uses]) => ({ hex, uses }));

  const fonts = new Map<string, number>();
  for (const link of links) {
    for (const family of (link.href ?? "").matchAll(/family=([^&:]+)/g)) countInto(fonts, decodeURIComponent(family[1].replace(/\+/g, " ")), 50);
  }
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (first && !first.startsWith("var(") && !GENERIC_FONTS.has(first.toLowerCase())) countInto(fonts, first, 1);
  }

  return {
    url: base,
    title: decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").slice(0, 200),
    description: (meta("description") || meta("og:description")).slice(0, 300),
    themeColor: themeColor && /^#[0-9a-f]{3,8}$/i.test(themeColor) ? themeColor.toLowerCase() : null,
    icons: [...new Map(icons.sort((a, b) => b.size - a.size).map((i) => [i.url, i])).keys()].slice(0, 6),
    colors: palette,
    fonts: [...fonts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f]) => f),
  };
}

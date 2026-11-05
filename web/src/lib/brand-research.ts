import type Anthropic from "@anthropic-ai/sdk";
import { askForJson } from "@/lib/claude";
import type { SiteHints } from "@/lib/site-hints";

// The brand kit's research: Claude searches the web for the brand's own logo, colours, typefaces and products,
// who it sells to, and what independent sources say about it. The site hints (read from the homepage) go in as
// evidence to check, not as answers.

export interface Source {
  name: string;
  date: string;
  url: string;
}

export interface BrandResearch {
  name: string;
  tagline: string;
  summary: string;
  logo_url: string;
  colors: { hex: string; name: string }[];
  fonts: string[];
  products: string[];
  market: string;
  market_sources: Source[];
  mentions: { tone: "good" | "watch"; text: string; source: Source }[];
}

const SOURCE = {
  type: "object",
  additionalProperties: false,
  required: ["name", "date", "url"],
  properties: {
    name: { type: "string", description: "The publication or site, e.g. TechCrunch" },
    date: { type: "string", description: "Published date like 12 Mar 2026, or empty if unknown" },
    url: { type: "string" },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "tagline", "summary", "logo_url", "colors", "fonts", "products", "market", "market_sources", "mentions"],
  properties: {
    name: { type: "string" },
    tagline: { type: "string" },
    summary: { type: "string" },
    logo_url: { type: "string", description: "Direct https link to the logo or app icon image, or empty" },
    colors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hex", "name"],
        properties: { hex: { type: "string", description: "#rrggbb" }, name: { type: "string" } },
      },
    },
    fonts: { type: "array", items: { type: "string" } },
    products: { type: "array", items: { type: "string" } },
    market: { type: "string" },
    market_sources: { type: "array", items: SOURCE },
    mentions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tone", "text", "source"],
        properties: { tone: { type: "string", enum: ["good", "watch"] }, text: { type: "string" }, source: SOURCE },
      },
    },
  },
};

function prompt(name: string, website: string, hints: SiteHints | null) {
  return `You're building the brand kit for ${name} (${website}). Brands use this kit to check the Instagram Reels that creators make for them: the kit's colours and typefaces are used to draw suggested fixes over the Reel, and the research explains why each fix matters to this brand.

Research the brand on the web and return:
- name: the brand's name, written the way the brand writes it.
- tagline: its own one-line description of itself, from its site.
- summary: two or three plain sentences for a brand manager: what the brand is, what it sells, and how it presents itself.
- logo_url: a direct link to an image file of its official logo or app icon (square if there is one; PNG, SVG or WebP), from its own domain, its press kit or Wikimedia Commons. Leave it empty if you can't find a direct image link. Never a web page.
- colors: 2 to 5 brand colours as #rrggbb with plain names. Main accent first, darkest last: fixes are drawn in those two. Prefer the brand's guidelines or press kit, then logoColors from the hints below: those are exact, read from the site's own icon file. The hints' colors are what its CSS uses most, mostly interface colours, so only list one if the logo or a guideline backs it or it's plainly the site's main accent. A link colour or an error red isn't a brand colour; two right colours beat five doubtful ones.
- fonts: the typefaces its site or guidelines use, most important first (1 to 3 names, no generic families).
- products: up to 8 product or feature names a Reel might show or say.
- market: who the brand sells to, in one or two plain sentences.
- market_sources: where that comes from.
- mentions: three things in the brand's favour (tone "good") and three to watch (tone "watch"), from independent coverage, reviews or public discussion in the last two years: what a brand manager should know before approving creator content. One sentence each, with the source.

Only cite pages that appeared in your search results or that you opened; never make up a URL. Write in plain, short sentences.

Site hints, read from the homepage's HTML and CSS (may be empty, partial or noisy):
${JSON.stringify(hints ?? { note: "The homepage could not be read." }, null, 1)}`;
}

const HEX = /^#[0-9a-f]{6}$/;
const httpUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
};
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const source = (s: Partial<Source> | undefined): Source | null => {
  const url = httpUrl(clean(s?.url, 500));
  return url ? { name: clean(s?.name, 80) || new URL(url).hostname, date: clean(s?.date, 20), url } : null;
};

/** The answer, trimmed to what the kit can use: bad hex colours, non-web links and empty lines dropped. */
export function tidyResearch(raw: Partial<BrandResearch>): BrandResearch {
  return {
    name: clean(raw.name, 80),
    tagline: clean(raw.tagline, 160),
    summary: clean(raw.summary, 600),
    logo_url: httpUrl(clean(raw.logo_url, 1000)),
    colors: (raw.colors ?? [])
      .map((c) => ({ hex: clean(c?.hex, 7).toLowerCase(), name: clean(c?.name, 30) }))
      .filter((c) => HEX.test(c.hex))
      .slice(0, 5),
    fonts: (raw.fonts ?? []).map((f) => clean(f, 40)).filter(Boolean).slice(0, 3),
    products: (raw.products ?? []).map((p) => clean(p, 60)).filter(Boolean).slice(0, 8),
    market: clean(raw.market, 400),
    market_sources: (raw.market_sources ?? []).map(source).filter((s): s is Source => s !== null).slice(0, 4),
    mentions: (raw.mentions ?? [])
      .map((m) => ({ tone: m?.tone === "good" ? ("good" as const) : ("watch" as const), text: clean(m?.text, 300), source: source(m?.source) }))
      .filter((m): m is BrandResearch["mentions"][number] => Boolean(m.text && m.source))
      .slice(0, 8),
  };
}

export interface ResearchResult {
  research: BrandResearch;
  costUsd: number;
  searches: number;
}

/** What the research is doing right now, for the brand folder's reading view. */
function describeBlock(block: Anthropic.Beta.BetaContentBlock): string | null {
  if (block.type !== "server_tool_use") return null;
  if (block.name === "web_search" && typeof block.input.query === "string") return `Searching the web for "${clean(block.input.query, 90)}"`;
  if (block.name === "web_fetch" && typeof block.input.url === "string") {
    const url = httpUrl(block.input.url);
    return url ? `Opening ${new URL(url).hostname.replace(/^www\./, "")}` : null;
  }
  return null;
}

export async function researchBrand(name: string, website: string, hints: SiteHints | null, onStep?: (step: string) => void): Promise<ResearchResult> {
  const { data, costUsd, searches } = await askForJson<Partial<BrandResearch>>({
    content: prompt(name, website, hints),
    schema: SCHEMA,
    effort: "medium",
    searches: 6,
    fetches: 4,
    onBlock: (block) => {
      const step = describeBlock(block);
      if (step) onStep?.(step);
    },
  });
  return { research: tidyResearch(data), costUsd, searches };
}

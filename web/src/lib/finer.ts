import type Anthropic from "@anthropic-ai/sdk";
import type { BrandKitData } from "@/lib/brand-kit";
import { askForJson } from "@/lib/claude";
import { workerHeaders } from "@/lib/check-reel";
import type { Box, FinerDetails, Moment, MomentKind, Source, Span } from "@/lib/details";
import { jobStore } from "@/lib/jobs";
import type { Report } from "@/lib/report";

// The finer-details pass on a checked Reel, for the brand it was made for:
// 1. the worker samples a frame a second (/frames);
// 2. Claude reads those frames with the ASCI report, the transcript and the brand kit, and lists what to change,
//    where each change shows (a box) and the fix to draw;
// 3. SAM 3.1 follows each box that marks a visible thing through its stretch of the Reel (/track), so the outline
//    moves with it; a box SAM can't follow, or one that marks an empty place, is held still.

export const finerDetails = jobStore<FinerDetails & { cost?: Record<string, number> }>("reel_details", "reel_id", "details");

interface WorkerFrames {
  duration_s: number;
  width: number;
  height: number;
  frames: { t: number; jpeg: string }[];
  poster: string;
}

interface WorkerTrack {
  tracks: Record<string, Span[]>;
  failed: string[];
  stills: { t: number; jpeg: string }[];
  cost_usd: number;
}

interface Where {
  t_start: number;
  t_end: number;
  t: number;
  box: number[];
  trace: boolean;
}

interface ReadMoment {
  kind: MomentKind;
  title: string;
  happened: string;
  should_be: string;
  why: string;
  source_ids: string[];
  where: Where[];
  fix: { style: "label" | "pill" | "note"; text: string; box: number[]; t_start: number; t_end: number } | null;
}

export interface FinerRead {
  finding: string;
  viewer: string;
  moments: ReadMoment[];
}

const NUMBERS = { type: "array", items: { type: "number" }, description: "[x, y, w, h], fractions of the frame from its top-left" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["finding", "viewer", "moments"],
  properties: {
    finding: { type: "string" },
    viewer: { type: "string" },
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "happened", "should_be", "why", "source_ids", "where", "fix"],
        properties: {
          kind: { type: "string", enum: ["ASCI", "Trust", "Showcase"] },
          title: { type: "string" },
          happened: { type: "string" },
          should_be: { type: "string" },
          why: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
          where: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["t_start", "t_end", "t", "box", "trace"],
              properties: { t_start: { type: "number" }, t_end: { type: "number" }, t: { type: "number" }, box: NUMBERS, trace: { type: "boolean" } },
            },
          },
          fix: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                required: ["style", "text", "box", "t_start", "t_end"],
                properties: {
                  style: { type: "string", enum: ["label", "pill", "note"] },
                  text: { type: "string" },
                  box: NUMBERS,
                  t_start: { type: "number" },
                  t_end: { type: "number" },
                },
              },
              { type: "null" },
            ],
          },
        },
      },
    },
  },
};

/** Every source the research cites, numbered, so the model cites by number and can't invent a link. */
export function numberSources(kit: BrandKitData): Map<string, Source> {
  const all = [...kit.mentions.map((m) => m.source), ...kit.market_sources];
  const unique = [...new Map(all.map((s) => [s.url, s])).values()];
  return new Map(unique.map((s, i) => [`S${i + 1}`, s]));
}

const at = (t: number) => `${t.toFixed(1)}s`;

function briefing(report: Report, kit: BrandKitData, sources: Map<string, Source>): string {
  const label = report.tracks.find((t) => t.kind === "disclosure_label");
  const sourceLines = [...sources].map(([id, s]) => {
    const said = kit.mentions.find((m) => m.source.url === s.url);
    return `${id}: ${s.name}${s.date ? `, ${s.date}` : ""}${said ? ` (${said.tone === "good" ? "in its favour" : "watch out"}): ${said.text}` : " (market)"}`;
  });
  return `You're reviewing an Instagram Reel a creator made for ${kit.name}. A brand manager at ${kit.name} reads your notes before approving it.

The brand kit
- Name: ${kit.name} (${kit.site}). ${kit.tagline}
- Products and features found in public sources (not a complete list): ${kit.products.join(", ") || "none listed"}
- Colours: ${kit.colors.map((c) => `${c.name} ${c.hex}`).join(", ")}. Typefaces: ${kit.fonts.join(", ") || "unknown"}
- Market: ${kit.market}

What people say (cite these by id):
${sourceLines.join("\n") || "No sources."}

The ASCI checks below were measured frame by frame and in the audio. Treat them as facts, and build on them.
Overall: ${report.verdict}
${report.checks.map((c) => `- ${c.title}: ${c.verdict}. ${c.detail}${c.evidence.length ? ` Evidence: ${c.evidence.map((e) => `${at(e.t_start)}-${at(e.t_end)} ${e.note}`).join("; ")}` : ""}`).join("\n")}
Disclosure label on screen: ${label?.spans.length ? label.spans.map((s) => `${at(s.t_start)}-${at(s.t_end)}`).join(", ") : "never"}

Transcript${report.audio_checked ? "" : " (the audio wasn't checked)"}:
${report.transcript.map((s) => `[${at(s.t_start)}-${at(s.t_end)}] ${s.text}`).join("\n") || "No speech."}

The Reel is ${report.video.duration_s}s long, ${report.video.width}x${report.video.height}. Its frames follow, one a second, each after its time.`;
}

const TASK = `List what the creator should change before this Reel goes live: 3 to 8 changes, most important first. Each is one kind:
- ASCI: India's advertising rules. The paid-partnership disclosure (whether there's a label, how long it shows, its language), and claims ASCI would flag, such as results, earnings, prices or "best" without backing.
- Trust: what could make viewers or the brand doubt the Reel: claims it doesn't back up, product facts that are wrong or confusing, and risky content given what people say about the brand. The kit's product list isn't complete: before calling a product name, offer or fact wrong, check it with a web search (you have three). Write what the source says, not that you searched.
- Showcase: how the brand comes across: whether its name is seen and said clearly, whether the product is on screen long and large enough to read, the opening, the ending and its call to action.

For each change:
- title: up to 8 words.
- happened: what the Reel does now, with times.
- should_be: exactly what to change. For on-screen text or a spoken line, give the words.
- why: why it matters for this brand in particular, using the research where it applies, with its ids in source_ids.
- where: 1 to 4 places it shows. t_start and t_end in seconds; t, a time inside them; box, [x, y, w, h] as fractions of the frame at t, around the thing on screen, or around where the fix belongs when the problem is that something is missing. trace is true when the box is around something visible that moves or changes and can be followed frame by frame, false when it marks an empty place.
- fix: what to draw over the Reel to show the corrected version, or null. style "label" for a disclosure label, "pill" for a short name or link, "note" for a caveat line; text up to 50 characters; box where it goes; t_start and t_end.

Also give finding: one or two sentences for the brand manager, saying whether it's ready to post and the main reason; and viewer: who this Reel speaks to, in one sentence, next to the brand's market.

Write plainly, in short sentences. Keep every time inside the Reel and every box inside the frame.`;

export async function readReel(report: Report, kit: BrandKitData, sources: Map<string, Source>, frames: WorkerFrames["frames"]) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: briefing(report, kit, sources) }];
  for (const f of frames) {
    content.push({ type: "text", text: at(f.t) }, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.jpeg } });
  }
  content.push({ type: "text", text: TASK });
  const { data, costUsd } = await askForJson<FinerRead>({ content, schema: SCHEMA, effort: "high", searches: 3 });
  return { read: data, costUsd };
}

async function worker<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.WORKER_URL;
  if (!base) throw new Error("The analysis worker isn't set up (WORKER_URL).");
  const response = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: workerHeaders("application/json"),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  });
  const data = (await response.json().catch(() => null)) as (T & { detail?: unknown }) | null;
  if (!response.ok || !data) {
    throw new Error(typeof data?.detail === "string" ? data.detail : `The analysis worker answered HTTP ${response.status}.`);
  }
  return data;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** A box inside the frame and at least 2% on each side. */
export function fitBox(box: number[]): Box {
  const w = clamp(box[2] ?? 0, 0.02, 1);
  const h = clamp(box[3] ?? 0, 0.02, 1);
  return [clamp(box[0] ?? 0, 0, 1 - w), clamp(box[1] ?? 0, 0, 1 - h), w, h].map((v) => Math.round(v * 10_000) / 10_000) as Box;
}

/** A stretch inside the Reel, at least a third of a second long. */
export function fitStretch(t_start: number, t_end: number, duration: number) {
  const start = clamp(t_start, 0, Math.max(0, duration - 0.3));
  return { t_start: Math.round(start * 10) / 10, t_end: Math.round(clamp(t_end, start + 0.3, duration) * 10) / 10 };
}

const objectId = (moment: number, place: number) => `${moment}.${place}`;

/** The objects SAM should follow: places marked trace, in the changes and places the screen keeps, at most 16. */
export function traceObjects(read: FinerRead, duration: number) {
  return read.moments
    .slice(0, 8)
    .flatMap((m, mi) =>
      m.where.slice(0, 4).flatMap((w, wi) => {
        if (!w.trace) return [];
        const stretch = fitStretch(w.t_start, w.t_end, duration);
        return [{ id: objectId(mi, wi), t: clamp(w.t, stretch.t_start, stretch.t_end), box: fitBox(w.box), ...stretch }];
      }),
    )
    .slice(0, 16);
}

/** The read, the tracks and the stills as the screen's data. */
export function assemble(
  reel: { id: string; filename: string },
  report: Report,
  kit: BrandKitData,
  sources: Map<string, Source>,
  frames: WorkerFrames,
  read: FinerRead,
  tracked: WorkerTrack,
): FinerDetails {
  const duration = report.video.duration_s;
  const poster = `data:image/jpeg;base64,${frames.poster}`;
  const moments: Moment[] = read.moments.slice(0, 8).map((m, mi) => {
    const spans: Span[] = (m.where.length ? m.where : [{ t_start: 0, t_end: duration, t: 0, box: [0.04, 0.03, 0.7, 0.05], trace: false }])
      .slice(0, 4)
      .flatMap((w, wi) => {
        const traced = tracked.tracks[objectId(mi, wi)];
        if (traced?.length) return traced;
        const stretch = fitStretch(w.t_start, w.t_end, duration);
        return [{ ...stretch, boxes: [{ t: clamp(w.t, stretch.t_start, stretch.t_end), box: fitBox(w.box) }] }];
      });
    const still = tracked.stills[mi];
    return {
      id: `m${mi + 1}`,
      kind: (["ASCI", "Trust", "Showcase"] as const).includes(m.kind) ? m.kind : "Showcase",
      title: m.title,
      happened: m.happened,
      shouldBe: m.should_be,
      why: m.why,
      sources: m.source_ids.map((id) => sources.get(id)).filter((s): s is Source => Boolean(s)),
      thumb: still ? `data:image/jpeg;base64,${still.jpeg}` : poster,
      spans,
      fix: m.fix?.text
        ? { style: m.fix.style, text: m.fix.text.slice(0, 60), box: fitBox(m.fix.box), spans: [fitStretch(m.fix.t_start, m.fix.t_end, duration)] }
        : undefined,
    };
  });
  return {
    reel: {
      filename: reel.filename,
      duration_s: duration,
      width: report.video.width || frames.width,
      height: report.video.height || frames.height,
      video: [{ src: `/api/reels/${reel.id}/video`, type: "" }],
      poster,
    },
    finding: read.finding,
    brand: {
      name: kit.name,
      site: kit.site,
      tagline: kit.tagline,
      logo: kit.logo,
      colors: kit.colors,
      fonts: kit.fonts,
      webFonts: kit.web_fonts,
      read_at: kit.read_at,
    },
    audience: { market: kit.market, viewer: read.viewer, sources: kit.market_sources },
    mentions: kit.mentions,
    moments,
  };
}

/** The whole pass for one Reel; never throws, a failure is saved on the row instead. Claim the row first. */
export async function buildFinerDetails(reel: { id: string; filename: string; video_url: string; report: Report }, kit: BrandKitData) {
  try {
    const sources = numberSources(kit);
    const frames = await worker<WorkerFrames>("/frames", { blob_url: reel.video_url, fps: 1, width: 360 });
    let { read, costUsd: readCost } = await readReel(reel.report, kit, sources, frames.frames);
    // The task asks for 3 to 8 changes; in testing one answer in a few came back with a single change. Ask once more.
    if (read.moments.length < 3) {
      const second = await readReel(reel.report, kit, sources, frames.frames);
      readCost += second.costUsd;
      if (second.read.moments.length > read.moments.length) read = second.read;
    }
    const tracked = await worker<WorkerTrack>("/track", {
      blob_url: reel.video_url,
      objects: traceObjects(read, reel.report.video.duration_s),
      stills: read.moments.slice(0, 8).map((m) => clamp(m.where[0]?.t ?? 0, 0, reel.report.video.duration_s)),
    });
    const details = assemble(reel, reel.report, kit, sources, frames, read, tracked);
    await finerDetails.finish(reel.id, { ...details, cost: { claude: readCost, sam: tracked.cost_usd } }, readCost + tracked.cost_usd);
  } catch (error) {
    await finerDetails.fail(reel.id, error);
  }
}

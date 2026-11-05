// The "Finer details" read of one checked Reel: what to change, where it shows, and why it matters to the brand's
// audience. Boxes are fractions of the frame ([x, y, w, h], 0-1), so they fit the player at any size.

export type Box = [x: number, y: number, w: number, h: number];

/** Where a problem is on screen over one stretch: a SAM 3.1 track, or one box held for the stretch. */
export interface Span {
  t_start: number;
  t_end: number;
  /** In time order. Between two keyframes the box moves linearly; outside them it holds. */
  boxes: { t: number; box: Box }[];
}

/** An on-brand fix drawn over the Reel in "With fixes" mode, in the brand's colours and type. */
export interface FixOverlay {
  style: "label" | "pill" | "note";
  text: string;
  box: Box;
  spans: { t_start: number; t_end: number }[];
}

export type MomentKind = "ASCI" | "Trust" | "Showcase";

export interface Source {
  name: string;
  date: string;
  url: string;
}

export interface Moment {
  id: string;
  kind: MomentKind;
  title: string;
  happened: string;
  shouldBe: string;
  why: string;
  sources: Source[];
  /** A still of the moment, for the list. */
  thumb: string;
  spans: Span[];
  fix?: FixOverlay;
}

export interface BrandKit {
  name: string;
  site: string;
  tagline: string;
  logo: string;
  /** The accent first and the darkest last: the fixes are drawn in those two. */
  colors: { hex: string; name: string }[];
  fonts: string[];
  /** Fonts to load from Google Fonts for the fixes; the preview loads its own with next/font. */
  webFonts?: string[];
  read_at: string;
}

export interface Mention {
  tone: "good" | "watch";
  text: string;
  source: Source;
}

export interface FinerDetails {
  reel: { filename: string; duration_s: number; width: number; height: number; video: { src: string; type: string }[]; poster: string };
  finding: string;
  brand: BrandKit;
  audience: { market: string; viewer: string; sources: Source[] };
  mentions: Mention[];
  moments: Moment[];
}

/** The box for a span at time t, interpolated between keyframes. */
export function boxAt(span: Span, t: number): Box {
  const frames = span.boxes;
  if (t <= frames[0].t) return frames[0].box;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      return a.box.map((v, j) => v + (b.box[j] - v) * k) as Box;
    }
  }
  return frames[frames.length - 1].box;
}

export const inSpan = (span: { t_start: number; t_end: number }, t: number) => t >= span.t_start && t < span.t_end;

/** The motion track in SceneData has one value per this many seconds. */
export const MOTION_STEP_S = 0.25;

/** Instagram's UI covers everything outside this part of a 9:16 frame: top 10%, bottom 22%, right 14%. */
export const CLEAR_OF_UI = { x0: 0, y0: 0.1, x1: 0.86, y1: 0.78 };

/** The share of a box that sits under Instagram's UI, 0 to 1. Box is [x, y, w, h] in fractions of the frame. */
export function underUiShare([x, y, w, h]: Box): number {
  const inside = Math.max(0, Math.min(x + w, CLEAR_OF_UI.x1) - Math.max(x, CLEAR_OF_UI.x0)) * Math.max(0, Math.min(y + h, CLEAR_OF_UI.y1) - Math.max(y, CLEAR_OF_UI.y0));
  return 1 - inside / (w * h || 1);
}

/** A box counts as colliding once a tenth of it is under the UI, not when one edge just grazes it. */
export const collidesWithUi = (box: Box) => underUiShare(box) >= 0.1;

/** The moment's first and last second, across all its spans. */
export function extent(moment: Moment): { t_start: number; t_end: number } {
  return {
    t_start: Math.min(...moment.spans.map((s) => s.t_start)),
    t_end: Math.max(...moment.spans.map((s) => s.t_end)),
  };
}

/** Plain text a brand can paste to the creator: every change, in order, with its time. */
export function fixList(details: FinerDetails, format: (t: number) => string): string {
  const lines = details.moments.map((m, i) => {
    const { t_start, t_end } = extent(m);
    return `${i + 1}. ${m.title} (${format(t_start)}–${format(t_end)})\n   ${m.shouldBe}`;
  });
  return `Changes for ${details.reel.filename}, before it goes live:\n\n${lines.join("\n\n")}`;
}

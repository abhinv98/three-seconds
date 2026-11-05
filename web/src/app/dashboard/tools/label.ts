import { asciClause, requiredHold } from "@/lib/asci";
import { contrast } from "@/lib/daypart";
import { collidesWithUi, type Box } from "@/lib/details";
import type { Clause } from "@/lib/report";

// The maths behind the tools page, with no browser in it.

/** A Reel 1080 wide is 1920 tall: the scale the label is drawn at. */
export const FRAME = { width: 1080, height: 1920 };

/** Text sizes in pixels at 1080 wide. 56 reads as about 20px on a 390px phone. */
export const SIZES = { S: 44, M: 56, L: 72 } as const;
export type Size = keyof typeof SIZES;

/** Just under Instagram's top bar, on the left: clear of everything it draws. */
export const SAFE_SPOT = { x: 0.05, y: 0.12 };

export function holdFor(durationS: number): { seconds: number | null; clause: Clause } {
  // requiredHold stops at 1.2e.II because uploads do. A length typed here can be longer.
  if (Math.round(durationS * 10) / 10 >= 120) return { seconds: null, clause: asciClause("ASCI-IG 1.2e.III") };
  return requiredHold(durationS);
}

/** Enough whole frames to meet the hold: rounding down would land a frame short. */
export const holdFrames = (seconds: number, fps = 30) => Math.ceil(seconds * fps - 1e-9);

/** Text colour for a background: the kit's own colour when it reads, else whichever of ink and white reads better. */
export function textColourOn(background: string, kitColours: string[]): string {
  const readable = kitColours.filter((hex) => hex.toLowerCase() !== background.toLowerCase() && contrast(hex, background) >= 4.5);
  if (readable.length) return readable.reduce((best, hex) => (contrast(hex, background) > contrast(best, background) ? hex : best));
  return contrast("#111111", background) >= contrast("#ffffff", background) ? "#111111" : "#ffffff";
}

/** The label's size at reel scale, from the text's measured width. */
export function labelSize(textWidth: number, size: number) {
  return { width: Math.ceil(textWidth + size * 1.1), height: Math.ceil(size * 1.7), radius: Math.round(size * 0.16), padX: size * 0.55 };
}

/** A position that keeps the whole label inside the frame. */
export function clampPosition(x: number, y: number, width: number, height: number) {
  const clamp = (v: number, hi: number) => Math.min(Math.max(v, 0), Math.max(0, hi));
  return { x: clamp(x, 1 - width / FRAME.width), y: clamp(y, 1 - height / FRAME.height) };
}

export const labelBox = (x: number, y: number, width: number, height: number): Box => [x, y, width / FRAME.width, height / FRAME.height];

export const isCovered = (box: Box) => collidesWithUi(box);

export function fileName(word: string, kit: string | null): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${["label", slug(kit ?? ""), slug(word)].filter(Boolean).join("-")}.png`;
}

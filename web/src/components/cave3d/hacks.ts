// The developer's leftovers, lying about Tickle's streets: hacks you can use on him in the chase. No three.js here,
// so the page's HUD can name them without loading the 3D engine.

export type HackKind = "debugger" | "429" | "undo" | "collab";
export const HACKS: Record<HackKind, { label: string; color: string; hex: number; tells: string }> = {
  debugger: { label: "debugger;", color: "#7cf29a", hex: 0x7cf29a, tells: "debugger; pauses him for three seconds." },
  "429": { label: "429", color: "#f2bd45", hex: 0xf2bd45, tells: "429 rate-limits him: a third of his speed for six seconds." },
  undo: { label: "Ctrl+Z", color: "#9ad0ff", hex: 0x9ad0ff, tells: "Ctrl+Z undoes his last six seconds of walking." },
  collab: { label: "Collab", color: "#f37a88", hex: 0xf37a88, tells: "A “Collab” sticker. Throw it at him: he hates that word." },
};

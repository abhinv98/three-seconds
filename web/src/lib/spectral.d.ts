// spectral.js 3.0.0 ships no types. Only what lib/paint.ts uses.
declare module "spectral.js" {
  export class Color {
    constructor(color: string);
    toString(options?: { format?: "hex" | "rgb" | "css" }): string;
  }
  export function mix(...parts: [Color, number][]): Color;
}

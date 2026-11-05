import { Color, mix } from "spectral.js";

// A band of a brand's colours mixed the way paint mixes: blue into yellow goes through green, not grey. Spectral.js by
// Ronald van Wijnen (MIT), after Kubelka-Munk. It runs on the server, so the page only gets the finished CSS gradient.

const STEPS_PER_PAIR = 6;

/** One colour on its own has nothing to mix with, so it stays flat. */
export function paintStops(hexes: string[]): string[] {
  if (hexes.length < 2) return hexes;
  const colors = hexes.map((hex) => new Color(hex));
  const stops = [hexes[0]];
  for (let i = 0; i < colors.length - 1; i++) {
    for (let step = 1; step <= STEPS_PER_PAIR; step++) {
      const t = step / STEPS_PER_PAIR;
      stops.push(t === 1 ? hexes[i + 1] : mix([colors[i], 1 - t], [colors[i + 1], t]).toString());
    }
  }
  return stops;
}

export function paintBand(hexes: string[]): string {
  const stops = paintStops(hexes);
  if (!stops.length) return "none";
  if (stops.length === 1) return stops[0];
  return `linear-gradient(90deg, ${stops.map((stop, i) => `${stop} ${((i / (stops.length - 1)) * 100).toFixed(2)}%`).join(", ")})`;
}

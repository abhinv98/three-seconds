import { expect, test } from "vitest";
import { paintBand, paintStops } from "./paint";

test("mixing goes through green, the way paint does, not grey", () => {
  const stops = paintStops(["#002185", "#fcd200"]);
  expect(stops).toHaveLength(7);
  expect(stops[0]).toBe("#002185");
  expect(stops[6]).toBe("#fcd200");
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(stops[3].slice(i, i + 2), 16));
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
});

test("every stop is a hex colour, across more than two colours", () => {
  const stops = paintStops(["#0064e1", "#ea4e12", "#121212"]);
  expect(stops).toHaveLength(13);
  for (const stop of stops) expect(stop).toMatch(/^#[0-9a-f]{6}$/i);
  expect(paintBand(["#0064e1", "#121212"])).toMatch(/^linear-gradient\(90deg, #0064e1 0\.00%, .* #121212 100\.00%\)$/);
});

test("one colour or none doesn't blow up", () => {
  expect(paintBand(["#0064e1"])).toBe("#0064e1");
  expect(paintBand([])).toBe("none");
});

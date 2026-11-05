import { Delaunay } from "d3-delaunay";
import { expect, test } from "vitest";
import { keyToCss, plateFor, PLATES, seedOf, Stippler, weightsFor } from "./stipple";

const SIZE = 40;
/** An image from a pixel function. */
function image(pixel: (x: number, y: number) => [number, number, number, number]) {
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) rgba.set(pixel(x, y), (y * SIZE + x) * 4);
  return rgba;
}

test("a white logo on a transparent ground goes on the dark plate", () => {
  expect(plateFor(image((x) => (x < 20 ? [255, 255, 255, 255] : [0, 0, 0, 0])))).toBe("dark");
});

test("a dark logo, a colour logo and a logo with its own white ground stay on paper", () => {
  expect(plateFor(image((x) => (x < 20 ? [10, 10, 10, 255] : [0, 0, 0, 0])))).toBe("light");
  expect(plateFor(image((x) => (x < 20 ? [8, 102, 255, 255] : [0, 0, 0, 0])))).toBe("light");
  expect(plateFor(image((x) => (x < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255])))).toBe("light");
});

test("an empty image has no ink at all", () => {
  expect(weightsFor(image(() => [0, 0, 0, 0]), PLATES.light).every((w) => w === 0)).toBe(true);
});

test("ink is what can be told from the plate, and transparent pixels hold none", () => {
  const weights = weightsFor(image((x) => (x < 10 ? [0, 0, 0, 255] : x < 20 ? [251, 250, 246, 255] : [0, 0, 0, 0])), PLATES.light);
  expect(weights[0]).toBe(1);
  expect(weights[15]).toBe(0);
  expect(weights[30]).toBe(0);
});

test("the dots settle on the logo, in the logo's colours", () => {
  const rgba = image((x) => (x < 20 ? [8, 102, 255, 255] : [0, 0, 0, 0]));
  const stippler = new Stippler(Delaunay, SIZE, weightsFor(rgba, PLATES.light), rgba, seedOf("meta.com"), 300);
  for (let i = 0; i < 25; i++) {
    stippler.relax();
    stippler.fly();
  }
  for (let i = 0; i < 80; i++) stippler.fly();
  let onLogo = 0;
  for (let i = 0; i < stippler.count; i++) if (stippler.shown[i * 2] < 21) onLogo += 1;
  expect(onLogo / stippler.count).toBeGreaterThan(0.97);
  expect(keyToCss(stippler.colourKey(5, 5))).toBe("rgb(0 102 255)");
});

test("the same logo settles the same way every time", () => {
  const rgba = image((x, y) => (x < y ? [0, 0, 0, 255] : [0, 0, 0, 0]));
  const make = () => new Stippler(Delaunay, SIZE, weightsFor(rgba, PLATES.light), rgba, seedOf("x"), 200);
  expect([...make().shown]).toEqual([...make().shown]);
});

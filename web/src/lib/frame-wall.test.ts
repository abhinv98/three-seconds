import { expect, test } from "vitest";
import { frameTimes, posterFrames, wallGrid } from "./frame-wall";

test("frames come at 2 a second and never run past the end", () => {
  expect(frameTimes(2)).toEqual([0, 0.5, 1, 1.5]);
  const times = frameTimes(49.64);
  expect(times).toHaveLength(99);
  expect(times.at(-1)).toBe(49);
  expect(frameTimes(0.2)).toEqual([0]);
});

test("the grid fits every frame inside the space, as large as it can", () => {
  for (const [count, w, h] of [
    [99, 800, 580],
    [99, 230, 240],
    [180, 800, 580],
    [1, 800, 580],
    [8, 300, 600],
  ]) {
    const grid = wallGrid(count, w, h);
    expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(count);
    expect(grid.cols * grid.tileW + (grid.cols - 1) * 2).toBeLessThanOrEqual(w + 1e-6);
    expect(grid.rows * grid.tileH + (grid.rows - 1) * 2).toBeLessThanOrEqual(h + 1e-6);
    expect(grid.tileH / grid.tileW).toBeCloseTo(16 / 9);
  }
  // A wide wall of 99 frames: about 47 by 83, not a thin strip of tiny tiles.
  expect(wallGrid(99, 800, 580).tileW).toBeGreaterThan(40);
});

test("the poster's frames are spread out and in range", () => {
  expect(posterFrames(99, 8)).toEqual([6, 18, 30, 43, 55, 68, 80, 92]);
  expect(posterFrames(3, 8)).toEqual([0, 0, 0, 1, 1, 2, 2, 2]);
});

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { AVENUE, barrierAt, BARRIER_ROWS, COLS, makePlan, PORTAL, ROWS, scatter, START, walk } from "./maze";
import { Grid } from "./paths";

describe("the city", () => {
  it("always has a way out round his barriers, whatever the day", () => {
    for (let seed = 0; seed < 300; seed++) {
      const plan = makePlan(seed);
      expect(plan).toHaveLength(ROWS);
      expect(plan[0]).toHaveLength(COLS);
      expect(walk(plan, START, PORTAL, barrierAt).length).toBeGreaterThan(ROWS);
    }
  });
  it("keeps the avenue open end to end until the chase", () => {
    const plan = makePlan(42);
    for (let j = 0; j < ROWS; j++) for (const i of AVENUE) expect(plan[j][i]).toBe(true);
    expect(walk(plan, START, PORTAL)).toHaveLength(ROWS);
    for (const j of BARRIER_ROWS) expect(barrierAt(10, j)).toBe(true);
  });
  it("puts a clock within reach of the gate, clocks all the way out, and some hacks", () => {
    for (let seed = 0; seed < 50; seed++) {
      const { route, clocks, hacks } = scatter(makePlan(seed), seed);
      expect(clocks[0]).toEqual(route[1]);
      expect(clocks.length).toBeGreaterThan(route.length / 2);
      expect(hacks.length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("walking round furniture", () => {
  const table = { x0: -1, x1: 1, z0: -1, z1: 1 };
  const grid = new Grid({ x0: -5, x1: 5, z0: -5, z1: 5 }, 0.2, [table], 0.25);
  it("goes round a table, not through it", () => {
    const path = grid.route(new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0));
    expect(path.length).toBeGreaterThan(1);
    let at = new THREE.Vector2(-3, 0);
    for (const p of path) {
      expect(grid.clear(at, p)).toBe(true);
      at = p;
    }
  });
  it("walks straight when nothing is in the way, and stops beside a blocked spot", () => {
    expect(grid.route(new THREE.Vector2(-3, 3), new THREE.Vector2(3, 3))).toHaveLength(1);
    const end = grid.route(new THREE.Vector2(-3, 0), new THREE.Vector2(0, 0)).at(-1)!;
    expect(grid.free(end.x, end.y)).toBe(true);
    expect(end.distanceTo(new THREE.Vector2(0, 0))).toBeLessThan(1.6);
  });
});

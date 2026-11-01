// The streets of Tickle's dimension, as a grid of 5-metre tiles: a wide avenue from the door you arrive through to
// his house, and a maze of alleys on either side. Generated from the day, so everyone gets the same city on the same
// day. In the chase he drops three barriers across the avenue; the alleys always lead round them.

export const TILE = 5;
export const COLS = 21;
export const ROWS = 13;
/** The avenue's columns, the portal's tile and the tile in front of his house. */
export const AVENUE = [9, 10, 11] as const;
export const PORTAL: [number, number] = [10, 0];
export const START: [number, number] = [10, 12];
/** Avenue rows his barriers close in the chase. */
export const BARRIER_ROWS = [10, 6, 2] as const;

export const tileX = (i: number) => (i - 10) * TILE;
export const tileZ = (j: number) => 2.5 - j * TILE;
export const tileAt = (x: number, z: number): [number, number] => [Math.round(x / TILE + 10), Math.round((2.5 - z) / TILE)];

export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** open[j][i]: a street tile; otherwise a building. */
export type Plan = boolean[][];

export function makePlan(seed: number): Plan {
  const rand = rng(seed);
  const open: Plan = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  for (let j = 0; j < ROWS; j++) for (const i of AVENUE) open[j][i] = true;

  // Each side is a perfect maze over its odd tiles, carved by a random depth-first walk.
  for (const cols of [
    [1, 3, 5, 7],
    [13, 15, 17, 19],
  ]) {
    const cells: [number, number][] = [];
    for (const i of cols) for (let j = 1; j < ROWS - 1; j += 2) cells.push([i, j]);
    const seen = new Set<string>();
    const key = (i: number, j: number) => `${i},${j}`;
    const stack: [number, number][] = [cells[Math.floor(rand() * cells.length)]];
    seen.add(key(...stack[0]));
    open[stack[0][1]][stack[0][0]] = true;
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const next = (
        [
          [i + 2, j],
          [i - 2, j],
          [i, j + 2],
          [i, j - 2],
        ] as [number, number][]
      ).filter(([a, b]) => cols.includes(a) && b >= 1 && b < ROWS - 1 && !seen.has(key(a, b)));
      if (!next.length) {
        stack.pop();
        continue;
      }
      const [a, b] = next[Math.floor(rand() * next.length)];
      open[(j + b) / 2][(i + a) / 2] = true;
      open[b][a] = true;
      seen.add(key(a, b));
      stack.push([a, b]);
    }
    // A few extra gaps, so there are loops to lose him in.
    for (const i of cols)
      for (let j = 1; j < ROWS - 1; j += 2) {
        if (cols.includes(i + 2) && !open[j][i + 1] && rand() < 0.18) open[j][i + 1] = true;
        if (j + 2 < ROWS - 1 && !open[j + 1][i] && rand() < 0.18) open[j + 1][i] = true;
      }
  }

  // Side streets from the avenue into each maze: at least one in every stretch between barriers, on both sides.
  const stretches = [[11], [7, 9], [3, 5], [1]];
  for (const facade of [8, 12])
    for (const rows of stretches) {
      const pick = rows[Math.floor(rand() * rows.length)];
      for (const j of rows) if (j === pick || rand() < 0.3) open[j][facade] = true;
    }
  return open;
}

/** Shortest walk over street tiles from a to b (4-neighbour), or [] when there is none. */
export function walk(plan: Plan, a: [number, number], b: [number, number], blocked?: (i: number, j: number) => boolean): [number, number][] {
  const key = (i: number, j: number) => j * COLS + i;
  const prev = new Map<number, number>([[key(...a), -1]]);
  const queue: [number, number][] = [a];
  while (queue.length) {
    const [i, j] = queue.shift()!;
    if (i === b[0] && j === b[1]) break;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS || !plan[nj][ni] || blocked?.(ni, nj) || prev.has(key(ni, nj))) continue;
      prev.set(key(ni, nj), key(i, j));
      queue.push([ni, nj]);
    }
  }
  if (!prev.has(key(...b))) return [];
  const out: [number, number][] = [];
  for (let k = key(...b); k !== -1; k = prev.get(k)!) out.unshift([k % COLS, Math.floor(k / COLS)]);
  return out;
}

export const barrierAt = (i: number, j: number) => (BARRIER_ROWS as readonly number[]).includes(j) && (AVENUE as readonly number[]).includes(i);

/** Where the clocks (+3 seconds) and the developer's leftover hacks lie in the chase. */
export function scatter(plan: Plan, seed: number) {
  const rand = rng(seed * 7 + 3);
  const route = walk(plan, START, PORTAL, barrierAt);
  const clocks: [number, number][] = [];
  // Along the way out: two tiles in every three, starting just past the gate.
  route.forEach((t, k) => {
    if (k > 0 && k < route.length - 1 && k % 3 !== 2) clocks.push(t);
  });
  // Dead ends get a clock or a hack: worth the detour, sometimes.
  const ends: [number, number][] = [];
  for (let j = 1; j < ROWS - 1; j++)
    for (let i = 0; i < COLS; i++) {
      if (!plan[j][i] || (AVENUE as readonly number[]).includes(i)) continue;
      const exits = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([di, dj]) => plan[j + dj]?.[i + di]).length;
      if (exits === 1) ends.push([i, j]);
    }
  const hacks: [number, number][] = [];
  for (const t of ends) {
    if (route.some(([i, j]) => i === t[0] && j === t[1])) continue;
    if (rand() < 0.45) hacks.push(t);
    else if (rand() < 0.5) clocks.push(t);
  }
  // At least four hacks: if the dead ends are too few, the rest lie on the way out.
  for (const [k, t] of route.entries()) {
    if (hacks.length >= 4) break;
    if (k % 5 !== 3 || (AVENUE as readonly number[]).includes(t[0])) continue;
    hacks.push(t);
  }
  return { route, clocks, hacks: hacks.slice(0, 7) };
}

/** Days since 1 January 1970 in India: the city changes at midnight IST. */
export const istDay = (now: number) => Math.floor((now + 330 * 60_000) / 86_400_000);

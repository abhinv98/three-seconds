import * as THREE from "three";

// Walking without walking through things. The house's floor is a fine grid; furniture and walls (grown by a body's
// half-width) are blocked; a route is a breadth-first search over free cells, pulled taut so it runs in straight
// lines wherever nothing is in the way.

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(
    private readonly area: Rect,
    private readonly size: number,
    solids: Rect[],
    grow: number,
  ) {
    this.cols = Math.ceil((area.x1 - area.x0) / size);
    this.rows = Math.ceil((area.z1 - area.z0) / size);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const x = area.x0 + (c + 0.5) * size;
        const z = area.z0 + (r + 0.5) * size;
        if (solids.some((b) => x > b.x0 - grow && x < b.x1 + grow && z > b.z0 - grow && z < b.z1 + grow)) this.blocked[r * this.cols + c] = 1;
      }
  }

  private index(x: number, z: number) {
    const c = Math.floor((x - this.area.x0) / this.size);
    const r = Math.floor((z - this.area.z0) / this.size);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }
  private centre(i: number) {
    return new THREE.Vector2(this.area.x0 + ((i % this.cols) + 0.5) * this.size, this.area.z0 + (Math.floor(i / this.cols) + 0.5) * this.size);
  }
  contains(x: number, z: number) {
    return this.index(x, z) >= 0;
  }
  free(x: number, z: number) {
    const i = this.index(x, z);
    return i >= 0 && !this.blocked[i];
  }

  /** The free cell nearest to a point (the point itself when it is free), searched ring by ring. */
  nearestFree(p: THREE.Vector2): THREE.Vector2 {
    if (this.free(p.x, p.y)) return p.clone();
    const start = this.index(p.x, p.y);
    if (start < 0) return p.clone();
    const c0 = start % this.cols;
    const r0 = Math.floor(start / this.cols);
    let best: THREE.Vector2 | null = null;
    let bestD = Infinity;
    for (let ring = 1; ring < 40 && !best; ring++)
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || this.blocked[r * this.cols + c]) continue;
          const q = this.centre(r * this.cols + c);
          const d = q.distanceTo(p);
          if (d < bestD) {
            bestD = d;
            best = q;
          }
        }
    return best ?? p.clone();
  }

  /** True when a body can walk straight from a to b. */
  clear(a: THREE.Vector2, b: THREE.Vector2) {
    const steps = Math.ceil(a.distanceTo(b) / (this.size * 0.4));
    for (let k = 1; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const z = a.y + ((b.y - a.y) * k) / steps;
      if (!this.free(x, z)) return false;
    }
    return true;
  }

  /** Points to walk through from `from` to `to` (or to the nearest free spot to it), excluding the start. */
  route(from: THREE.Vector2, to: THREE.Vector2): THREE.Vector2[] {
    const goal = this.nearestFree(to);
    const start = this.nearestFree(from);
    if (this.clear(start, goal)) return [goal];
    const s = this.index(start.x, start.y);
    const g = this.index(goal.x, goal.y);
    if (s < 0 || g < 0) return [goal];
    const prev = new Int32Array(this.cols * this.rows).fill(-1);
    prev[s] = s;
    const queue = new Int32Array(this.cols * this.rows);
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === g) break;
      const c = cur % this.cols;
      const r = Math.floor(cur / this.cols);
      for (const [dc, dr] of N4) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const n = nr * this.cols + nc;
        if (prev[n] >= 0 || this.blocked[n]) continue;
        prev[n] = cur;
        queue[tail++] = n;
      }
    }
    if (prev[g] < 0) return [goal];
    const cells: THREE.Vector2[] = [];
    for (let cur = g; cur !== s; cur = prev[cur]) cells.unshift(this.centre(cur));
    cells[cells.length - 1] = goal;
    // Pull the string: keep only the corners a straight line cannot cut.
    const out: THREE.Vector2[] = [];
    let anchor = start;
    for (let i = 0; i < cells.length; i++) {
      const next = cells[i + 1];
      if (next && this.clear(anchor, next)) continue;
      out.push(cells[i]);
      anchor = cells[i];
    }
    return out;
  }
}

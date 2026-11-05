// The wall of frames on the check screen: which moments to pull from the file, and how to lay them out. The worker
// reads a Reel at 2 frames a second, so the wall shows that same rate.

export const WALL_FPS = 2;

/** The times to pull, half a second apart, stopping before the file ends: a seek to the very end can come back empty. */
export function frameTimes(durationS: number, fps = WALL_FPS): number[] {
  const count = Math.max(1, Math.floor(durationS * fps));
  return Array.from({ length: count }, (_, i) => Math.min(i / fps, Math.max(0, durationS - 0.05)));
}

export interface WallGrid {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
}

/** The grid of 9:16 tiles that makes each tile as large as it can be in this space. */
export function wallGrid(count: number, width: number, height: number, gap = 2): WallGrid {
  let best: WallGrid = { cols: 1, rows: count, tileW: 0, tileH: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = Math.min((width - (cols - 1) * gap) / cols, (((height - (rows - 1) * gap) / rows) * 9) / 16);
    if (tileW > best.tileW) best = { cols, rows, tileW, tileH: (tileW * 16) / 9 };
  }
  return best;
}

/** Which frame goes in each tile of a filmstrip poster: evenly spaced, each from the middle of its share of the Reel. */
export function posterFrames(frameCount: number, tiles: number): number[] {
  return Array.from({ length: tiles }, (_, k) => Math.min(frameCount - 1, Math.floor(((k + 0.5) / tiles) * frameCount)));
}

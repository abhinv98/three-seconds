// A Reel's thumbnail: a filmstrip of evenly spaced frames, captured in the browser while it uploads and kept on the
// Reel's row. The library shows the first tile and scrubs through the rest on hover, with no video loaded.

export const POSTER_TILES = 8;
export const POSTER_TILE_W = 180;
export const POSTER_TILE_H = 320;

const POSTER_PREFIX = "data:image/jpeg;base64,";
const MAX_POSTER_CHARS = 400_000;

/** A JPEG data URL of a sane size, or null. It comes from the browser, so it's checked like anything else from there. */
export function validPoster(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith(POSTER_PREFIX) || value.length > MAX_POSTER_CHARS) return null;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(POSTER_PREFIX.length)) ? value : null;
}

export function posterBytes(poster: string): Buffer {
  return Buffer.from(poster.slice(POSTER_PREFIX.length), "base64");
}

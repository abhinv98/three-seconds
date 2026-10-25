/** mm:ss.t, the design system's timecode format: 00:03.2 */
export function formatTimecode(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** One decimal and a lowercase s: 1.8s */
export function formatSeconds(seconds: number): string {
  return `${(Math.round(seconds * 10) / 10).toFixed(1)}s`;
}

export function formatRange(start: number, end: number): string {
  return `${formatTimecode(start)}–${formatTimecode(end)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Matches mm:ss.t timecodes inside prose, e.g. "appears at 00:03.0". */
export const TIMECODE_IN_TEXT = /\b(\d{2}):(\d{2}\.\d)\b/g;

export function parseTimecode(minutes: string, seconds: string): number {
  return Number(minutes) * 60 + Number(seconds);
}

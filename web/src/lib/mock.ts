import fixture from "../../../shared/fixtures/mock-report.json";
import sample from "../../../shared/fixtures/sample-report.json";
import { formatHold, requiredHold } from "./asci";
import { formatSeconds, formatTimecode, parseTimecode } from "./format";
import type { Report } from "./report";

const FIXTURE = fixture as Report;

export interface MockReportInput {
  filename: string;
  blobUrl: string;
  durationS?: number;
  width?: number;
  height?: number;
  jobId?: string;
  now?: Date;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rescales every time in a sentence ("1.8s", "00:03.0") by k, so the fixture's
 * 28 second story keeps its shape on a video of any length.
 */
export function scaleTimesInText(text: string, k: number): string {
  if (k === 1) return text;
  return text
    .replace(/\b(\d{2}):(\d{2}\.\d)\b/g, (_, mm: string, ss: string) =>
      formatTimecode(parseTimecode(mm, ss) * k),
    )
    .replace(/\b(\d+(?:\.\d+)?)s\b/g, (_, s: string) => formatSeconds(Number(s) * k));
}

/** The fixture with the real file swapped in. Timestamps scale to the real duration. */
export function buildMockReport(input: MockReportInput): Report {
  const base = structuredClone(FIXTURE);
  const duration =
    input.durationS && Number.isFinite(input.durationS) && input.durationS > 0
      ? input.durationS
      : base.video.duration_s;
  const k = duration / base.video.duration_s;
  const t = (x: number) => Math.min(duration, round1(x * k));
  const text = (s: string) => scaleTimesInText(s, k);
  // 1.2e's hold isn't proportional (3s up to 15s, then a third), so label_duration's is recomputed, not scaled.
  const hold = requiredHold(duration);
  const holdText = (s: string) =>
    s.replace(/(needs|at least) \d+(?:\.\d+)?s/g, (_, word: string) => `${word} ${formatHold(hold.seconds)}`);

  return {
    ...base,
    job_id: input.jobId ?? crypto.randomUUID(),
    mock: true,
    video: {
      ...base.video,
      filename: input.filename,
      blob_url: input.blobUrl,
      duration_s: duration,
      width: input.width && input.width > 0 ? Math.round(input.width) : base.video.width,
      height: input.height && input.height > 0 ? Math.round(input.height) : base.video.height,
    },
    checks: base.checks.map((check) => {
      const scaled = {
        ...check,
        detail: text(check.detail),
        evidence: check.evidence.map((e) => ({
          ...e,
          t_start: t(e.t_start),
          t_end: t(e.t_end),
          note: text(e.note),
        })),
        fix: check.fix ? { steps: check.fix.steps.map(text) } : (check.fix ?? null),
      };
      if (check.id !== "label_duration") return scaled;
      return {
        ...scaled,
        clause: hold.clause,
        detail: holdText(scaled.detail),
        fix: scaled.fix ? { steps: scaled.fix.steps.map(holdText) } : scaled.fix,
      };
    }),
    tracks: base.tracks.map((track) => ({
      ...track,
      spans: track.spans.map((s) => ({ t_start: t(s.t_start), t_end: t(s.t_end) })),
      first_seen_s: track.first_seen_s === null ? null : t(track.first_seen_s),
      last_seen_s: track.last_seen_s === null ? null : t(track.last_seen_s),
      total_on_screen_s: round1(track.total_on_screen_s * k),
      longest_continuous_s: round1(track.longest_continuous_s * k),
    })),
    transcript: base.transcript.map((seg) => ({
      ...seg,
      t_start: t(seg.t_start),
      t_end: t(seg.t_end),
    })),
    generated_at: (input.now ?? new Date()).toISOString(),
  };
}

/** A real report from the deployed pipeline, for the sample on the upload page and /report/sample. */
export const SAMPLE_REPORT = sample as Report;

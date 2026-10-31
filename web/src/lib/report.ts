// Hand-written types for shared/report.schema.json. src/lib/report.test.ts keeps them honest
// by validating the fixture (and generated mock reports) against the schema.

export type Verdict = "PASS" | "FAIL" | "REVIEW";

export type CheckId =
  | "label_present"
  | "label_duration"
  | "spoken_disclosure"
  | "label_language";

export interface VideoMeta {
  filename: string;
  blob_url: string;
  duration_s: number;
  width: number;
  height: number;
  fps_sampled: number;
}

export interface Clause {
  code: string;
  text: string;
  source_url: string | null;
}

export interface Evidence {
  t_start: number;
  t_end: number;
  kind: "frame" | "audio";
  note: string;
}

export interface Fix {
  steps: string[];
}

export interface Check {
  id: CheckId;
  title: string;
  verdict: Verdict;
  detail: string;
  clause: Clause | null;
  evidence: Evidence[];
  fix?: Fix | null;
}

export interface Span {
  t_start: number;
  t_end: number;
}

export interface Track {
  label: string;
  kind: "disclosure_label" | "brand";
  spans: Span[];
  first_seen_s: number | null;
  last_seen_s: number | null;
  total_on_screen_s: number;
  longest_continuous_s: number;
  max_frame_share: number;
}

export interface TranscriptSegment {
  t_start: number;
  t_end: number;
  text: string;
  lang: string;
}

export interface Report {
  job_id: string;
  status: "done" | "error";
  mock: boolean;
  video: VideoMeta;
  verdict: Verdict;
  checks: Check[];
  tracks: Track[];
  transcript: TranscriptSegment[];
  models_used: string[];
  generated_at: string;
}

const SEVERITY: Record<Verdict, number> = { FAIL: 0, REVIEW: 1, PASS: 2 };

/** Checks ordered worst first; stable within a verdict. */
export function bySeverity(checks: Check[]): Check[] {
  return checks
    .map((check, index) => ({ check, index }))
    .sort((a, b) => SEVERITY[a.check.verdict] - SEVERITY[b.check.verdict] || a.index - b.index)
    .map(({ check }) => check);
}

export function countByVerdict(checks: Check[]): Record<Verdict, number> {
  const counts: Record<Verdict, number> = { FAIL: 0, REVIEW: 0, PASS: 0 };
  for (const check of checks) counts[check.verdict] += 1;
  return counts;
}

export function verdictStatus(verdict: Verdict): "pass" | "fail" | "review" {
  return verdict === "PASS" ? "pass" : verdict === "FAIL" ? "fail" : "review";
}

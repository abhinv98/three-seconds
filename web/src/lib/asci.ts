// Verified ASCI clauses (shared/asci-clauses.json, quoted from the guideline PDF) and the 1.2e hold rule.
// worker/pipeline/asci.py reads the same file and applies the same rule to real reports.
import asci from "../../../shared/asci-clauses.json";
import { formatSeconds } from "./format";
import type { Clause } from "./report";

export const ASCI_SOURCE_URL = asci.source_url;

export function asciClause(code: string): Clause {
  const clause = asci.clauses.find((c) => c.code === code);
  if (!clause) throw new Error(`Unknown ASCI clause ${code}`);
  return { ...clause, source_url: ASCI_SOURCE_URL };
}

/** 1.2e: 3s for videos of 15s or less (I), a third of the length up to 2 minutes (II). Uploads stop at 90s. */
export function requiredHold(durationS: number): { seconds: number; clause: Clause } {
  const d = Math.round(durationS * 10) / 10;
  return d <= 15
    ? { seconds: 3, clause: asciClause("ASCI-IG 1.2e.I") }
    : { seconds: d / 3, clause: asciClause("ASCI-IG 1.2e.II") };
}

/** 3.0s, 9.5s; 9.33s for a third of 28s, so a 9.3s hold doesn't read as meeting it (same as the worker). */
export function formatHold(seconds: number): string {
  return Math.abs(seconds * 10 - Math.round(seconds * 10)) < 1e-9 ? formatSeconds(seconds) : `${seconds.toFixed(2)}s`;
}

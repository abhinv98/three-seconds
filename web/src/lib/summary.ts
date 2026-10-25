import { formatSeconds, formatTimecode } from "./format";
import { bySeverity, type Report } from "./report";

function firstSentence(text: string): { head: string; rest: string } {
  const match = text.match(/^(.+?[.!?])(\s+|$)([\s\S]*)$/);
  if (!match) return { head: text, rest: "" };
  return { head: match[1], rest: match[3].trim() };
}

/** The measured sentence at the top of a report: worst check first, its detail split into head and note. */
export function verdictHeadline(report: Report): { headline: string; note: string } {
  const worst = bySeverity(report.checks)[0];
  if (report.verdict === "PASS" || !worst || worst.verdict === "PASS") {
    return { headline: "Good to post.", note: `All ${report.checks.length} checks passed.` };
  }
  const { head, rest } = firstSentence(worst.detail);
  return { headline: head, note: rest };
}

/** The one-sentence description of the timeline that screen readers announce. */
export function timelineSummary(report: Report): string {
  const parts: string[] = [];
  for (const track of report.tracks) {
    const name = track.kind === "disclosure_label" ? "Disclosure label" : "Brand";
    if (track.spans.length === 0) {
      parts.push(`${name} not seen.`);
    } else if (track.spans.length === 1) {
      const [s] = track.spans;
      parts.push(
        `${name} on screen ${formatSeconds(track.total_on_screen_s)}, ${formatTimecode(s.t_start)} to ${formatTimecode(s.t_end)}.`,
      );
    } else {
      parts.push(
        `${name} on screen ${formatSeconds(track.total_on_screen_s)} across ${track.spans.length} spans.`,
      );
    }
  }
  const spoken = spokenMarkers(report);
  parts.push(
    spoken.length
      ? `Spoken disclosure at ${spoken.map((m) => formatTimecode(m.t)).join(", ")}.`
      : "No spoken disclosure found.",
  );
  return parts.join(" ");
}

export function spokenMarkers(report: Report): { t: number; text: string }[] {
  return report.checks
    .filter((c) => c.id === "spoken_disclosure")
    .flatMap((c) => c.evidence.filter((e) => e.kind === "audio"))
    .map((e) => ({ t: e.t_start, text: e.note }));
}

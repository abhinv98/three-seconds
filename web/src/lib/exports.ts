import type { FinerDetails } from "@/lib/details";
import type { ReelNote } from "@/lib/review";

// Markers for an editor: columns Name,Start,Duration,Description, timecodes HH:MM:SS:FF at 30 fps non-drop. No byte order
// mark, so the first column is exactly "Name". One record a line, because the importers read line by line.

const FPS = 30;

const framesAt = (seconds: number) => Math.round(Math.max(0, seconds) * FPS);

function timecode(frames: number): string {
  const seconds = Math.floor(frames / FPS);
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frames % FPS];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

function cell(value: string): string {
  const flat = value.replace(/\s*[\r\n]+\s*/g, " ").trim();
  // A spreadsheet runs a cell that starts with one of these as a formula, and notes are free text.
  const safe = /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
  return /[",]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function premiereMarkersCsv(details: FinerDetails, notes: ReelNote[]): string {
  const markers = [
    ...details.moments.flatMap((moment, i) =>
      moment.spans.map((span) => ({
        name: `${i + 1}. ${moment.title}`,
        start: framesAt(span.t_start),
        end: framesAt(span.t_end),
        description: `${moment.kind}: ${moment.shouldBe}`,
      })),
    ),
    ...notes.map((note) => ({ name: "Note", start: framesAt(note.t), end: framesAt(note.t), description: `${note.by_name}: ${note.text}` })),
  ].sort((a, b) => a.start - b.start);
  const rows = markers.map((m) => [cell(m.name), timecode(m.start), timecode(Math.max(0, m.end - m.start)), cell(m.description)].join(","));
  return `${["Name,Start,Duration,Description", ...rows].join("\r\n")}\r\n`;
}

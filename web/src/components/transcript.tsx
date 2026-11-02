import { TimecodeChip } from "@/components/timecode-chip";
import type { TranscriptSegment } from "@/lib/report";
import { cn } from "@/lib/utils";

const LANGUAGE_NAMES: Record<string, string> = {
  "hi-Latn": "Hinglish",
  "hi-Deva": "Hindi",
  hi: "Hindi",
  en: "English",
  und: "Other language",
};

interface TranscriptProps {
  segments: TranscriptSegment[];
  /** False when the audio stage didn't run, so an empty transcript isn't "no speech". */
  audioChecked: boolean;
  disclosureTimes: number[];
  time: number;
  onSeek: (t: number) => void;
}

export function Transcript({ segments, audioChecked, disclosureTimes, time, onSeek }: TranscriptProps) {
  const languages = [...new Set(segments.map((s) => LANGUAGE_NAMES[s.lang] ?? s.lang))];
  return (
    <section aria-labelledby="transcript-heading">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id="transcript-heading" className="ts-title">
          Transcript
        </h2>
        {languages.length > 0 && <p className="ts-caption text-muted-foreground">{languages.join(", ")}</p>}
      </div>
      {segments.length === 0 ? (
        <p className="ts-body-sm py-4 text-muted-foreground">
          {audioChecked ? "No speech found." : "Audio not checked yet."}
        </p>
      ) : (
        <ol className="divide-y divide-border">
          {segments.map((segment, i) => {
            const disclosure = disclosureTimes.some((t) => t >= segment.t_start && t <= segment.t_end);
            const active = time >= segment.t_start && time < segment.t_end;
            return (
              <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 py-2.5">
                <TimecodeChip t={segment.t_start} label={segment.text} onSeek={onSeek} active={active} />
                <div className="min-w-0 pt-0.5">
                  <p
                    lang={segment.lang}
                    className={cn(segment.lang === "hi-Deva" ? "ts-transcript-deva" : "ts-body", "text-pretty")}
                  >
                    {disclosure ? (
                      <mark className="rounded-xs bg-brand-surface px-1 text-foreground [box-decoration-break:clone]">
                        {segment.text}
                      </mark>
                    ) : (
                      segment.text
                    )}
                  </p>
                  {disclosure && <p className="ts-label mt-1 text-brand-text">Spoken disclosure</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

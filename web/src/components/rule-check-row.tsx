import { Icon } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { TimecodeChip, TimecodeText } from "@/components/timecode-chip";
import { verdictStatus, type Check, type Evidence } from "@/lib/report";

const EVIDENCE_WORD: Record<Evidence["kind"], string> = {
  audio: "Audio:",
  frame: "Frames:",
  label: "Label:",
  caption: "Caption:",
};

interface RuleCheckRowProps {
  check: Check;
  time: number;
  onSeek: (t: number) => void;
}

/** One ASCI check: verdict, finding, evidence timecodes, cited clause. */
export function RuleCheckRow({ check, time, onSeek }: RuleCheckRowProps) {
  return (
    <li className="grid gap-2 py-5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4">
      <div className="sm:pt-0.5">
        <StatusBadge status={verdictStatus(check.verdict)} />
      </div>
      <div className="min-w-0">
        <h3 className="ts-title">{check.title}</h3>
        <p className="ts-body mt-1 text-pretty">
          <TimecodeText text={check.detail} onSeek={onSeek} />
        </p>

        {check.evidence.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2" aria-label={`Evidence for ${check.title}`}>
            {check.evidence.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TimecodeChip
                  t={e.t_start}
                  end={e.t_end}
                  label={e.note}
                  onSeek={onSeek}
                  active={time >= e.t_start && time <= e.t_end}
                />
                <span className="ts-body-sm inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <Icon name={e.kind === "audio" ? "mic" : "film"} size={14} />
                  <span className="sr-only">{EVIDENCE_WORD[e.kind]}</span>
                  {e.note}
                </span>
              </li>
            ))}
          </ul>
        )}

        {check.clause && (
          <p className="ts-caption mt-3 flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
            <span className="sr-only">Clause</span>
            <span className="ts-code text-foreground">{check.clause.code}</span>
            <span>{check.clause.text}</span>
            {check.clause.source_url && (
              <a
                href={check.clause.source_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xs text-brand-text underline decoration-1 underline-offset-2 hover:decoration-2"
              >
                Source
              </a>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

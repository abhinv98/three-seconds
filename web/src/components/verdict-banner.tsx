import { Icon, type IconName } from "@/components/icon";
import { StatusBadge } from "@/components/status-badge";
import { TimecodeText } from "@/components/timecode-chip";
import { formatSeconds, formatTimecode } from "@/lib/format";
import { countByVerdict, verdictStatus, type Report, type Verdict } from "@/lib/report";
import { verdictHeadline } from "@/lib/summary";
import { cn } from "@/lib/utils";

const COUNT_STYLE: Record<Verdict, { icon: IconName; word: string; className: string }> = {
  FAIL: { icon: "cross", word: "fail", className: "text-fail-text" },
  REVIEW: { icon: "eye", word: "review", className: "text-review-text" },
  PASS: { icon: "check", word: "pass", className: "text-pass-text" },
};

interface VerdictBannerProps {
  report: Report;
  onSeek?: (t: number) => void;
}

/** Top of every report: the verdict word, the measured sentence, the readout. */
export function VerdictBanner({ report, onSeek }: VerdictBannerProps) {
  const { headline, note } = verdictHeadline(report);
  const counts = countByVerdict(report.checks);
  const label = report.tracks.find((t) => t.kind === "disclosure_label");

  return (
    <section aria-labelledby="verdict-headline" className="rounded-lg bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <p className="sr-only">Overall verdict</p>
          <StatusBadge status={verdictStatus(report.verdict)} tone="solid" size="stamp" />
          <h1 id="verdict-headline" className="ts-display mt-4 text-balance">
            {headline}
          </h1>
          {note && (
            <p className="ts-body mt-2 max-w-[62ch] text-pretty text-muted-foreground">
              <TimecodeText text={note} onSeek={onSeek} />
            </p>
          )}
        </div>
        {label && (
          <div className="shrink-0 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-1 sm:pl-6 sm:text-right">
            <p className="ts-readout">{formatSeconds(label.total_on_screen_s)}</p>
            <p className="ts-caption mt-1 text-muted-foreground">
              Label on screen, of {formatSeconds(report.video.duration_s)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
        <ul className="ts-body-sm flex flex-wrap gap-x-5 gap-y-1" aria-label="Checks by verdict">
          {(Object.keys(COUNT_STYLE) as Verdict[]).map((verdict) => {
            const style = COUNT_STYLE[verdict];
            return (
              <li
                key={verdict}
                className={cn(
                  "inline-flex items-center gap-1.5",
                  counts[verdict] ? style.className : "text-muted-foreground",
                )}
              >
                <Icon name={style.icon} size={16} />
                <span className="font-semibold">{counts[verdict]}</span> {style.word}
              </li>
            );
          })}
        </ul>
        <p className="ts-body-sm flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="ts-code min-w-0 break-all text-foreground">{report.video.filename}</span>
          <span aria-hidden="true">·</span>
          <span className="ts-timecode">{formatTimecode(report.video.duration_s)}</span>
          <span aria-hidden="true">·</span>
          <span>Checked against ASCI influencer guidelines</span>
          {report.mock && (
            <span className="ts-label rounded-sm border border-input px-1.5 py-0.5 text-muted-foreground">
              Sample data
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

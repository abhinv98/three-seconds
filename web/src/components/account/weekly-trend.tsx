import { Check, Eye, X } from "lucide-react";
import type { TrendWeek } from "@/lib/overview";
import { cn } from "@/lib/utils";

// Reels checked per week, split by verdict. Verdict colours are status colours, so each carries an icon and a word in the
// legend and the tooltip. The numbers are in the table for screen readers. No client code: the tooltip is CSS.

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const PARTS = [
  { key: "fail", word: "Fail", icon: X, fill: "bg-fail" },
  { key: "review", word: "Review", icon: Eye, fill: "bg-review" },
  { key: "pass", word: "Pass", icon: Check, fill: "bg-pass" },
] as const;
const total = (w: TrendWeek) => w.pass + w.review + w.fail;

/** A round top for the axis: 1, 2, 5 or 10 times a power of ten, at or above the highest week. */
export function axisTop(highest: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, highest)));
  return [1, 2, 5, 10].map((m) => m * power).find((v) => v >= highest) ?? 10 * power;
}

export function WeeklyTrend({ weeks }: { weeks: TrendWeek[] }) {
  const top = axisTop(Math.max(...weeks.map(total)));
  const last = weeks.length - 1;
  return (
    <figure className="grid gap-3 px-5 pt-4 pb-4">
      <figcaption className="sr-only">Reels checked per week for the last {weeks.length} weeks, by verdict.</figcaption>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        {PARTS.map(({ word, icon: Icon, fill }) => (
          <li key={word} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("grid size-3.5 place-items-center rounded-[3px] text-background", fill)}>
              <Icon size={10} strokeWidth={3} />
            </span>
            {word}
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-2">
        <div className="relative h-[116px] font-mono text-[11px] text-muted-foreground">
          <span className="absolute top-0 right-0 -translate-y-1/2">{top}</span>
          <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
        </div>
        <div className="relative flex h-[116px] items-end gap-1 border-b border-border">
          <span className="absolute inset-x-0 top-0 border-t border-border" />
          {weeks.map((week, i) => (
            <div key={week.start} tabIndex={-1} className="trend-column group relative flex h-full flex-1 items-end justify-center">
              <div className="flex w-full max-w-6 flex-col justify-end gap-0.5" style={{ height: `${(total(week) / top) * 100}%` }}>
                {PARTS.map(({ key, fill }) =>
                  week[key] ? <span key={key} className={cn("block min-h-[3px] first:rounded-t-[3px]", fill)} style={{ flexGrow: week[key] }} /> : null,
                )}
              </div>
              <div className={cn("trend-tip", i < 2 ? "left-0" : i > last - 2 ? "right-0" : "left-1/2 -translate-x-1/2")}>
                <p className="font-semibold whitespace-nowrap">Week of {DAY.format(week.start)}</p>
                <p className="whitespace-nowrap">{total(week) ? PARTS.map(({ key, word }) => `${week[key]} ${word.toLowerCase()}`).join(", ") : "Nothing checked"}</p>
              </div>
            </div>
          ))}
        </div>
        <div />
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{DAY.format(weeks[0].start)}</span>
          <span>{DAY.format(weeks[last].start)}</span>
        </div>
      </div>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Week of</th>
            <th>Pass</th>
            <th>Review</th>
            <th>Fail</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.start}>
              <td>{DAY.format(week.start)}</td>
              <td>{week.pass}</td>
              <td>{week.review}</td>
              <td>{week.fail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

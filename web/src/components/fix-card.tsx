import { TimecodeText } from "@/components/timecode-chip";
import { bySeverity, type Check } from "@/lib/report";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

interface FixCardProps {
  checks: Check[];
  onSeek: (t: number) => void;
}

/** Every FAIL and REVIEW comes with its fix. Steps are grouped worst first. */
export function FixCard({ checks, onSeek }: FixCardProps) {
  const items = bySeverity(checks)
    .filter((c) => (c.verdict === "FAIL" || c.verdict === "REVIEW") && c.fix?.steps.length)
    .flatMap((c) => (c.fix?.steps ?? []).map((step) => ({ step, check: c })));
  if (items.length === 0) return null;

  const count = items.length;
  const heading = `Fix ${NUMBER_WORDS[count] ?? count} ${count === 1 ? "thing" : "things"} before you post`;

  return (
    <section aria-labelledby="fix-heading" className="rounded-lg bg-brand-surface p-4 sm:p-6">
      <h2 id="fix-heading" className="ts-title">
        {heading}
      </h2>
      <ol className="mt-4 flex flex-col gap-4">
        {items.map(({ step, check }, i) => (
          <li key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
            <span
              aria-hidden="true"
              className="ts-timecode flex size-7 items-center justify-center rounded-sm bg-background text-foreground"
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="ts-body text-pretty">
                <TimecodeText text={step} onSeek={onSeek} />
              </p>
              <p className="ts-caption mt-1 text-muted-foreground">
                {check.title} · {check.verdict === "FAIL" ? "Fail" : "Review"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

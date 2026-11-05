import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

export type Status = "pass" | "fail" | "review" | "info" | "running" | "pending";

const META: Record<Status, { word: string; icon: IconName }> = {
  pass: { word: "Pass", icon: "check" },
  fail: { word: "Fail", icon: "cross" },
  review: { word: "Review", icon: "eye" },
  info: { word: "Info", icon: "info" },
  running: { word: "Running", icon: "spinner" },
  pending: { word: "Pending", icon: "circle" },
};

const SOLID: Record<Status, string> = {
  pass: "bg-pass text-pass-foreground",
  fail: "bg-fail text-fail-foreground",
  review: "bg-review text-review-foreground",
  info: "bg-muted text-foreground",
  running: "bg-primary text-primary-foreground",
  pending: "bg-muted text-muted-foreground",
};

const SOFT: Record<Status, string> = {
  pass: "bg-pass-surface text-pass-text",
  fail: "bg-fail-surface text-fail-text",
  review: "bg-review-surface text-review-text",
  info: "bg-muted text-foreground",
  running: "bg-muted text-foreground",
  pending: "bg-muted text-muted-foreground",
};

/** A rubber stamp: ink outline and ink word on the paper (.stamp-ink in globals.css roughens the edges). */
const STAMP: Record<Status, string> = {
  pass: "stamp-ink text-pass-text",
  fail: "stamp-ink text-fail-text",
  review: "stamp-ink text-review-text",
  info: "stamp-ink text-foreground",
  running: "stamp-ink text-foreground",
  pending: "stamp-ink text-muted-foreground",
};

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: Status;
  tone?: "solid" | "soft" | "stamp";
  size?: "sm" | "stamp";
  "data-stamp"?: string;
  "data-stamp-ghost"?: string;
}

/** Verdict word plus icon. Colour is the third signal, never the only one. */
export function StatusBadge({ status, tone = "soft", size = "sm", className, ...rest }: StatusBadgeProps) {
  const { word, icon } = META[status];
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-sm font-bold uppercase",
        tone === "solid" ? SOLID[status] : tone === "stamp" ? STAMP[status] : SOFT[status],
        size === "sm" && "h-6 gap-1 px-2 text-xs leading-4 tracking-[0.08em]",
        size === "stamp" && "h-12 gap-2 px-3.5 text-[28px] leading-none tracking-[0.08em] sm:h-[60px] sm:px-5 sm:text-[38px]",
        className,
      )}
    >
      <Icon name={icon} size={size === "stamp" ? 28 : 14} className={size === "stamp" ? "size-6 sm:size-8" : undefined} />
      {word}
    </span>
  );
}

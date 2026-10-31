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

interface StatusBadgeProps {
  status: Status;
  tone?: "solid" | "soft";
  size?: "sm" | "stamp";
  className?: string;
}

/** Verdict word plus icon. Colour is the third signal, never the only one. */
export function StatusBadge({ status, tone = "soft", size = "sm", className }: StatusBadgeProps) {
  const { word, icon } = META[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-sm font-bold uppercase",
        tone === "solid" ? SOLID[status] : SOFT[status],
        size === "sm" && "h-6 gap-1 px-2 text-xs leading-4 tracking-[0.08em]",
        size === "stamp" && "h-11 gap-2 px-3 text-[26px] leading-none tracking-[0.06em] sm:h-14 sm:px-4 sm:text-[34px]",
        className,
      )}
    >
      <Icon name={icon} size={size === "stamp" ? 28 : 14} className={size === "stamp" ? "size-6 sm:size-8" : undefined} />
      {word}
    </span>
  );
}

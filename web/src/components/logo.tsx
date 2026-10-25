import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "lockup" | "mark" | "wordmark";
  /** Mark height in px. Minimum 16. */
  size?: number;
  className?: string;
  title?: string;
}

// Mark #5 from the design system (Appendix C), drawn in currentColor.
function Mark({ size }: { size: number }) {
  return (
    <svg
      viewBox="1.5 1.5 24.6 22"
      height={size}
      width={(size * 24.6) / 22}
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M23.8 9.6 C23 8.4 22 8 20.7 8 C18.8 8 17.5 9.2 17.5 10.9 C17.5 12.8 19.1 13.6 20.8 14.3 C22.7 15.1 24.1 15.9 24.1 18 C24.1 20.2 22.5 21.5 20.5 21.5 H3.5" />
      <path d="M3.5 3.5 H8.5 A4.25 4.25 0 0 1 8.5 12 A4.75 4.75 0 0 1 8.5 21.5" />
      <path d="M8.5 12 H6" />
    </svg>
  );
}

export function Logo({ variant = "lockup", size = 24, className, title = "Three Seconds" }: LogoProps) {
  const markSize = Math.max(16, size);
  return (
    <span
      role="img"
      aria-label={title}
      className={cn("inline-flex items-center", className)}
      style={{ gap: variant === "lockup" ? markSize * 0.32 : undefined }}
    >
      {variant !== "wordmark" && <Mark size={markSize} />}
      {variant !== "mark" && (
        <span
          aria-hidden="true"
          className="font-extrabold uppercase leading-none whitespace-nowrap"
          style={{ fontSize: markSize * 0.6, letterSpacing: "0.08em" }}
        >
          Three Seconds
        </span>
      )}
    </span>
  );
}

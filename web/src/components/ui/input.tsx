import * as React from "react";
import { cn } from "@/lib/utils";

// Fields for the account pages: the compact buttons' 36px height and 6px corners. Focus keeps the global ring.
export const fieldClass =
  "h-9 w-full min-w-0 rounded-[6px] border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground transition-colors duration-[120ms] hover:border-foreground/30 aria-invalid:border-fail disabled:opacity-50";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldClass, className)} {...props} />;
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select data-slot="select" className={cn(fieldClass, "pr-8", className)} {...props} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export { Field, Input, Select };

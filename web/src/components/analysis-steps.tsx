import { Icon } from "@/components/icon";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface AnalysisStep {
  id: string;
  label: string;
  detail?: string;
  status: "done" | "active" | "pending" | "fail";
  /** 0 to 100, shown as a bar under the step. */
  progress?: number;
}

const STATUS_WORD: Record<AnalysisStep["status"], string> = {
  done: "done",
  active: "in progress",
  pending: "waiting",
  fail: "failed",
};

function StepIcon({ status }: { status: AnalysisStep["status"] }) {
  if (status === "done") return <Icon name="check" size={20} className="text-pass-text" />;
  if (status === "active") return <Icon name="spinner" size={20} className="text-foreground" />;
  if (status === "fail") return <Icon name="cross" size={20} className="text-fail-text" />;
  return <Icon name="circle" size={20} className="text-muted-foreground" />;
}

/** Progress while the check runs. */
export function AnalysisSteps({ steps, className }: { steps: AnalysisStep[]; className?: string }) {
  return (
    <ol className={cn("divide-y divide-border", className)} aria-label="Check progress">
      {steps.map((step) => (
        <li
          key={step.id}
          aria-current={step.status === "active" ? "step" : undefined}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-4"
        >
          <span className="pt-0.5">
            <StepIcon status={step.status} />
          </span>
          <div className="min-w-0">
            <p className={cn("ts-body font-semibold", step.status === "pending" && "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">, {STATUS_WORD[step.status]}</span>
            </p>
            {step.detail && (
              <p
                className={cn(
                  "ts-body-sm mt-0.5 text-pretty",
                  step.status === "fail" ? "text-fail-text" : "text-muted-foreground",
                )}
              >
                {step.detail}
              </p>
            )}
            {typeof step.progress === "number" && (
              <Progress value={step.progress} className="mt-3 h-1.5" aria-label={`${step.label} progress`} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

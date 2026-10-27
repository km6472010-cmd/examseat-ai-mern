import { cn } from "@/lib/utils";

export function ConfidenceBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-status-correct" : pct >= 60 ? "bg-status-review" : "bg-status-wrong";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

import { CheckCircle2, XCircle, AlertTriangle, CircleDashed, UserRoundSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationStatus } from "@/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<VerificationStatus, { label: string; variant: "success" | "wrong" | "review" | "empty" | "unassigned"; icon: React.ComponentType<{ className?: string }> }> = {
  CORRECT: { label: "Correct", variant: "success", icon: CheckCircle2 },
  WRONG_SEAT: { label: "Wrong Seat", variant: "wrong", icon: XCircle },
  NEEDS_REVIEW: { label: "Needs Review", variant: "review", icon: AlertTriangle },
  EMPTY: { label: "Empty", variant: "empty", icon: CircleDashed },
  UNASSIGNED: { label: "Unassigned", variant: "unassigned", icon: UserRoundSearch },
};

export function StatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const cfg = CONFIG[status] ?? CONFIG.NEEDS_REVIEW;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className={cn(className)}>
      <Icon className="size-3" />
      {cfg.label}
    </Badge>
  );
}

export const STATUS_DOT_CLASS: Record<VerificationStatus, string> = {
  CORRECT: "bg-status-correct",
  WRONG_SEAT: "bg-status-wrong",
  NEEDS_REVIEW: "bg-status-review",
  EMPTY: "bg-status-empty",
  UNASSIGNED: "bg-status-unassigned",
};

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  CORRECT: "Correct",
  WRONG_SEAT: "Wrong Seat",
  NEEDS_REVIEW: "Needs Review",
  EMPTY: "Empty",
  UNASSIGNED: "Unassigned",
};

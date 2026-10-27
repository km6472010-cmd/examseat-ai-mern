import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  icon: Icon,
  accentClassName,
  suffix,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  accentClassName?: string;
  suffix?: string;
}) {
  return (
    <Card className="py-4">
      <div className="flex items-center justify-between px-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {value}
            {suffix && <span className="ml-0.5 text-base font-normal text-muted-foreground">{suffix}</span>}
          </p>
        </div>
        {Icon && (
          <div className={cn("flex size-9 items-center justify-center rounded-lg bg-muted", accentClassName)}>
            <Icon className="size-4.5" />
          </div>
        )}
      </div>
    </Card>
  );
}

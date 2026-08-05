import { Badge } from "@/components/ui/badge";
import type { ModuleStatus } from "@/lib/modules";
import { cn } from "@/lib/utils";

const LABELS: Record<ModuleStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
};

const VARIANTS: Record<ModuleStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  complete: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export function StatusBadge({ status }: { status: ModuleStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", VARIANTS[status])}>
      {LABELS[status]}
    </Badge>
  );
}

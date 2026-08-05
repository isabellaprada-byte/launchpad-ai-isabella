import { DashboardShell } from "@/components/dashboard-shell";

export function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <DashboardShell title={title} description={description}>
      <p className="text-sm text-muted-foreground">
        This module will be built in a later phase.
      </p>
    </DashboardShell>
  );
}

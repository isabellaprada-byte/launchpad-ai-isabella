import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Participant } from "@/app/participants/page";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  terminated: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  on_leave: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  not_eligible: "bg-muted text-muted-foreground",
};

export function ParticipantTable({ participants }: { participants: Participant[] }) {
  const counts = participants.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-sm">
        <span className="text-muted-foreground">{participants.length} total</span>
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} variant="secondary" className={`text-xs ${STATUS_STYLES[status] ?? ""}`}>
            {count} {status.replace("_", " ")}
          </Badge>
        ))}
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Hire Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Pre-tax %</TableHead>
              <TableHead>Roth %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-xs font-mono">{p.employee_id}</TableCell>
                <TableCell className="text-sm">{p.first_name} {p.last_name}</TableCell>
                <TableCell className="text-xs">{p.email ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.hire_date ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[p.status] ?? ""}`}>
                    {p.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {p.annual_salary ? `$${p.annual_salary.toLocaleString()}` : "—"}
                </TableCell>
                <TableCell className="text-xs">{p.deferral_rate_pretax ?? "—"}</TableCell>
                <TableCell className="text-xs">{p.deferral_rate_roth ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

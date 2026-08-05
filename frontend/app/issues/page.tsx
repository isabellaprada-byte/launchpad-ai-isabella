"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Issue = {
  id: string;
  payroll_run_id: string;
  employee_id: string | null;
  issue_type: string;
  severity: "error" | "warning" | "info";
  description: string;
  agent_explanation: string;
  status: string;
  suggested_fixes: Fix[];
};

type Fix = {
  id: string;
  field_name: string;
  before_value: { value: unknown } | null;
  after_value: { value: unknown } | null;
  reason: string;
  status: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  error: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-muted text-muted-foreground",
  resolved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [acting, setActing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  function fetchIssues() {
    fetch("/api/issues/get")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setIssues(json.data ?? []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchIssues(); }, []);

  async function handleApprove(fixId: string) {
    setActing(true);
    try {
      const res = await fetch("/api/fixes/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSelected(null);
      fetchIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  async function handleReject(fixId: string) {
    setActing(true);
    try {
      const res = await fetch("/api/fixes/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSelected(null);
      fetchIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(false);
    }
  }

  const filtered = issues.filter((i) => {
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return true;
  });

  return (
    <DashboardShell
      title="Reconciliation Issues"
      description="Review detected issues and approve or reject suggested fixes"
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No issues found.</p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Issue Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="text-xs font-mono">{issue.employee_id ?? "—"}</TableCell>
                    <TableCell className="text-xs">{issue.issue_type}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${SEVERITY_STYLES[issue.severity]}`}>
                        {issue.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[issue.status] ?? ""}`}>
                        {issue.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {issue.description}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(issue)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.issue_type}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="flex gap-2">
                <Badge variant="secondary" className={`text-xs ${SEVERITY_STYLES[selected.severity]}`}>
                  {selected.severity}
                </Badge>
                <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[selected.status] ?? ""}`}>
                  {selected.status}
                </Badge>
              </div>

              <div>
                <p className="font-medium">Employee</p>
                <p className="text-muted-foreground">{selected.employee_id ?? "Unknown"}</p>
              </div>

              <div>
                <p className="font-medium">Agent Explanation</p>
                <p className="text-muted-foreground">{selected.agent_explanation}</p>
              </div>

              {selected.suggested_fixes?.filter((f) => f.status === "pending").map((fix) => (
                <div key={fix.id} className="rounded-lg border border-border p-3 space-y-2">
                  <p className="font-medium">Suggested Fix</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Field:</span> {fix.field_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Before:</span>{" "}
                    {String(fix.before_value?.value ?? "—")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">After:</span>{" "}
                    {String(fix.after_value?.value ?? "—")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Reason:</span> {fix.reason}
                  </p>
                  {selected.status === "open" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" disabled={acting} onClick={() => handleApprove(fix.id)}>
                        {acting ? "…" : "Approve Fix"}
                      </Button>
                      <Button size="sm" variant="outline" disabled={acting} onClick={() => handleReject(fix.id)}>
                        {acting ? "…" : "Reject Fix"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {(!selected.suggested_fixes?.length || selected.suggested_fixes.every((f) => f.status !== "pending")) && selected.status === "open" && (
                <p className="text-xs text-muted-foreground">No fix suggested — requires manual review.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

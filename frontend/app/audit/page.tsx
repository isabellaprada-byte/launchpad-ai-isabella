"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AuditLog = {
  id: string;
  timestamp: string;
  actor_type: "user" | "agent" | "system";
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  field_name: string | null;
  before_value: unknown;
  after_value: unknown;
  reason: string | null;
  status: string | null;
};

const ACTOR_STYLES: Record<string, string> = {
  user: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  agent: "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200",
  system: "bg-muted text-muted-foreground",
};

const ACTIONS = [
  "FILE_UPLOADED", "PLAN_EXTRACTED", "FIELD_UPDATED",
  "MAPPING_SUGGESTED", "MAPPING_APPROVED",
  "PAYROLL_VALIDATED", "ISSUE_CREATED",
  "FIX_SUGGESTED", "FIX_APPROVED", "FIX_REJECTED", "FIX_APPLIED",
  "CHAT_QUESTION_ASKED", "MCP_TOOL_CALLED",
];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");

  useEffect(() => {
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (actorFilter !== "all") params.set("actor_type", actorFilter);

    setLoading(true);
    fetch(`/api/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setLogs(json.data ?? []);
      })
      .catch(() => setError("Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, [actionFilter, actorFilter]);

  function formatValue(v: unknown): string {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object" && v !== null && "value" in v)
      return String((v as Record<string, unknown>).value);
    return JSON.stringify(v);
  }

  return (
    <DashboardShell
      title="Change Logs"
      description="Chronological audit trail of every user and agent action"
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          <Select value={actionFilter} onValueChange={(v) => setActionFilter(v ?? "all")}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Filter by action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actorFilter} onValueChange={(v) => setActorFilter(v ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit log entries found.</p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${ACTOR_STYLES[log.actor_type] ?? ""}`}
                      >
                        {log.actor_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.action}</TableCell>
                    <TableCell className="text-xs">
                      {log.entity_type ?? "—"}
                      {log.entity_id ? (
                        <span className="ml-1 text-muted-foreground">
                          ({log.entity_id.slice(0, 8)}…)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">{log.field_name ?? "—"}</TableCell>
                    <TableCell className="max-w-32 truncate text-xs">
                      {formatValue(log.before_value)}
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-xs">
                      {formatValue(log.after_value)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                      {log.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { UploadedRun, MappingRow } from "@/app/payroll/mapping/page";

const TARGET_FIELDS = [
  "employee_id", "first_name", "last_name", "email",
  "gross_wages", "pretax_contribution", "roth_contribution",
  "employer_match", "loan_repayment", "pay_date", "employment_status",
];

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function PayrollMappingReview({
  uploadedRun,
  onApproved,
}: {
  uploadedRun: UploadedRun;
  onApproved: () => void;
}) {
  const [mappings, setMappings] = useState<MappingRow[]>(uploadedRun.mappings);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTarget(sourceColumn: string, newTarget: string) {
    setMappings((prev) =>
      prev.map((m) =>
        m.source_column === sourceColumn
          ? { ...m, suggested_target: newTarget === "none" ? null : newTarget }
          : m
      )
    );
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch("/api/payroll/approve-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: uploadedRun.run.id,
          mappings,
          rows: uploadedRun.rows,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {mappings.length} columns detected · review and approve the mapping below
        </p>
        <Button onClick={handleApprove} disabled={approving}>
          {approving ? "Approving…" : "Approve Mapping"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source Column</TableHead>
              <TableHead>Mapped To</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((m) => (
              <TableRow key={m.source_column} className={m.ambiguous ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}>
                <TableCell className="font-mono text-sm">
                  {m.source_column}
                  {m.ambiguous && (
                    <span className="ml-2 text-xs text-amber-600" title={m.ambiguity_reason}>
                      ⚠ ambiguous
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Select
                    value={m.suggested_target ?? "none"}
                    onValueChange={(v) => updateTarget(m.source_column, v)}
                  >
                    <SelectTrigger className="h-8 w-52 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— not mapped —</SelectItem>
                      {TARGET_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`text-xs ${CONFIDENCE_STYLES[m.confidence]}`}>
                    {m.confidence}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

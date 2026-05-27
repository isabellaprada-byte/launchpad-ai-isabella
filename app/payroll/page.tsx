"use client";

import { useEffect, useState, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type PayrollRun = {
  id: string;
  run_number: number;
  file_name: string;
  pay_date: string | null;
  status: string;
};

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  mapped: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  reconciled: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export default function PayrollRunsPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function fetchRuns() {
    fetch("/api/payroll/get")
      .then((r) => r.json())
      .then((json) => setRuns(json.data ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchRuns(); }, []);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const nextRun = (runs.at(-1)?.run_number ?? 1) + 1;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("runNumber", String(nextRun));
      const res = await fetch("/api/payroll/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleReconcile(runId: string) {
    setReconciling(runId);
    setError(null);
    try {
      const res = await fetch("/api/payroll/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      fetchRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconciling(null);
    }
  }

  return (
    <DashboardShell
      title="Payroll Runs"
      description="Upload and reconcile payroll runs 2–5"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{runs.length} run{runs.length !== 1 ? "s" : ""} uploaded</p>
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            variant="outline"
          >
            {uploading ? "Uploading…" : "Upload Payroll Run"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payroll runs uploaded yet.</p>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Pay Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">Run {run.run_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{run.file_name}</TableCell>
                    <TableCell className="text-xs">{run.pay_date ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[run.status] ?? ""}`}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {run.run_number > 1 && run.status !== "reconciled" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={reconciling === run.id}
                          onClick={() => handleReconcile(run.id)}
                        >
                          {reconciling === run.id ? "Reconciling…" : "Reconcile"}
                        </Button>
                      )}
                      {run.status === "reconciled" && (
                        <span className="text-xs text-emerald-600">✓ Done</span>
                      )}
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

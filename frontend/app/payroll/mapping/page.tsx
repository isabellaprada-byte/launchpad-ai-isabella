"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PayrollMappingUpload } from "@/components/payroll-mapping-upload";
import { PayrollMappingReview } from "@/components/payroll-mapping-review";

export type MappingRow = {
  source_column: string;
  suggested_target: string | null;
  confidence: "high" | "medium" | "low";
  ambiguous: boolean;
  ambiguity_reason?: string;
};

export type UploadedRun = {
  run: { id: string; run_number: number; file_name: string };
  headers: string[];
  rows: Record<string, string>[];
  mappings: MappingRow[];
};

export default function PayrollMappingPage() {
  const [uploadedRun, setUploadedRun] = useState<UploadedRun | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/payroll/get?type=mapping")
      .then((r) => r.json())
      .then((json) => { if (json.data?.approved) setApproved(true); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell
      title="Payroll Mapping"
      description="Map payroll columns to system fields — used for all subsequent runs"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : approved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          ✓ Column mapping approved. All payroll runs will use this mapping.
        </div>
      ) : uploadedRun ? (
        <PayrollMappingReview uploadedRun={uploadedRun} onApproved={() => setApproved(true)} />
      ) : (
        <PayrollMappingUpload onUploaded={setUploadedRun} />
      )}
    </DashboardShell>
  );
}

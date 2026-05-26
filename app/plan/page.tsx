"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PlanUpload } from "@/components/plan-upload";
import { PlanReview } from "@/components/plan-review";

export type PlanData = {
  id: string;
  company_name: string | null;
  ein: string | null;
  plan_name: string | null;
  plan_effective_date: string | null;
  eligibility_age: number | null;
  eligibility_service_months: number | null;
  entry_dates: string | null;
  auto_enrollment: boolean | null;
  auto_enrollment_rate: number | null;
  auto_escalation: boolean | null;
  auto_escalation_max: number | null;
  employer_match_formula: string | null;
  safe_harbor: boolean | null;
  roth_permitted: boolean | null;
  loans_permitted: boolean | null;
  loan_max_outstanding: number | null;
  loan_max_amount: number | null;
  extraction_confidence: Record<string, "high" | "medium" | "low"> | null;
  flags: Array<{ field: string; description: string; severity: string }> | null;
  status: string | null;
};

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/plan/get")
      .then((r) => r.json())
      .then((json) => { if (json.data) setPlan(json.data); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell
      title="Plan Details"
      description="Upload the plan PDF and review extracted fields"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : plan ? (
        <PlanReview plan={plan} onPlanUpdate={setPlan} />
      ) : (
        <PlanUpload onExtracted={setPlan} />
      )}
    </DashboardShell>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PlanData } from "@/app/plan/page";

const FIELD_LABELS: Record<string, string> = {
  company_name: "Company Name",
  ein: "EIN",
  plan_name: "Plan Name",
  plan_effective_date: "Effective Date",
  eligibility_age: "Eligibility Age",
  eligibility_service_months: "Eligibility Service (months)",
  entry_dates: "Entry Dates",
  auto_enrollment: "Auto-Enrollment",
  auto_enrollment_rate: "Auto-Enrollment Rate (%)",
  auto_escalation: "Auto-Escalation",
  auto_escalation_max: "Auto-Escalation Max (%)",
  employer_match_formula: "Employer Match Formula",
  safe_harbor: "Safe Harbor",
  roth_permitted: "Roth Permitted",
  loans_permitted: "Loans Permitted",
  loan_max_outstanding: "Max Loans Outstanding",
  loan_max_amount: "Max Loan Amount ($)",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

const FLAG_STYLES: Record<string, string> = {
  error: "border-destructive bg-destructive/10 text-destructive",
  warning: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
};

export function PlanReview({
  plan,
  onPlanUpdate,
}: {
  plan: PlanData;
  onPlanUpdate: (plan: PlanData) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flags = plan.flags ?? [];
  const confidence = plan.extraction_confidence ?? {};

  async function saveEdit(field: string) {
    setSaving(true);
    setError(null);
    try {
      const previousValue = plan[field as keyof PlanData];
      const res = await fetch("/api/plan/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, field, value: editValue, previousValue }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onPlanUpdate(json.data);
      setEditingField(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function confirmPlan() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/plan/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onPlanUpdate(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      {flags.length > 0 && (
        <div className="space-y-2">
          {flags.map((flag, i) => (
            <div
              key={i}
              className={`rounded-lg border px-4 py-3 text-sm ${FLAG_STYLES[flag.severity] ?? FLAG_STYLES.info}`}
            >
              <span className="font-semibold capitalize">{flag.severity}:</span>{" "}
              {flag.description}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(FIELD_LABELS).map((field) => {
              const rawValue = plan[field as keyof PlanData];
              const displayValue =
                rawValue === null || rawValue === undefined
                  ? "—"
                  : typeof rawValue === "boolean"
                    ? rawValue
                      ? "Yes"
                      : "No"
                    : String(rawValue);
              const conf = confidence[field] ?? "low";
              const isEditing = editingField === field;

              return (
                <TableRow
                  key={field}
                  className={conf === "low" ? "bg-red-50/50 dark:bg-red-950/20" : undefined}
                >
                  <TableCell className="font-medium">{FIELD_LABELS[field]}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                      />
                    ) : (
                      displayValue
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${CONFIDENCE_STYLES[conf]}`}
                    >
                      {conf}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          disabled={saving}
                          onClick={() => saveEdit(field)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingField(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setEditingField(field);
                          setEditValue(displayValue === "—" ? "" : displayValue);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {plan.status !== "approved" ? (
        <Button onClick={confirmPlan} disabled={confirming}>
          {confirming ? "Confirming…" : "Confirm Plan Details"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            ✓ Plan Confirmed
          </Badge>
          <span className="text-sm text-muted-foreground">
            All fields have been reviewed and approved.
          </span>
        </div>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { ModuleStatus } from "@/lib/modules";

export type StatusMap = Record<string, ModuleStatus>;

async function count(table: string): Promise<number> {
  const { count, error } = await getSupabase()
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function GET() {
  try {
    const [
      plansResult,
      participantsCount,
      mappingsResult,
      runsCount,
      issuesResult,
      auditCount,
      chatResult,
    ] = await Promise.all([
      getSupabase().from("plans").select("status").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      count("participants"),
      getSupabase()
        .from("payroll_mappings")
        .select("status")
        .eq("status", "approved")
        .limit(1),
      count("payroll_runs"),
      getSupabase()
        .from("reconciliation_issues")
        .select("status")
        .limit(100),
      count("audit_logs"),
      getSupabase()
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("action", "CHAT_QUESTION_ASKED"),
    ]);

    if (plansResult.error) throw plansResult.error;
    if (mappingsResult.error) throw mappingsResult.error;
    if (issuesResult.error) throw issuesResult.error;
    if (chatResult.error) throw chatResult.error;

    const planStatus = plansResult.data?.status;
    let plan_details: ModuleStatus = "not_started";
    if (planStatus === "approved") plan_details = "complete";
    else if (plansResult.data) plan_details = "in_progress";

    let participants: ModuleStatus = "not_started";
    if (participantsCount >= 30) participants = "complete";
    else if (participantsCount > 0) participants = "in_progress";

    let payroll_mapping: ModuleStatus = "not_started";
    if (mappingsResult.data && mappingsResult.data.length > 0) {
      payroll_mapping = "complete";
    } else {
      const { count: mappingCount } = await getSupabase()
        .from("payroll_mappings")
        .select("*", { count: "exact", head: true });
      if ((mappingCount ?? 0) > 0) payroll_mapping = "in_progress";
    }

    let payroll_runs: ModuleStatus = "not_started";
    if (runsCount >= 5) payroll_runs = "complete";
    else if (runsCount > 0) payroll_runs = "in_progress";

    const issues = issuesResult.data ?? [];
    let reconciliation_issues: ModuleStatus = "not_started";
    if (issues.length > 0) {
      const allResolved = issues.every((i) => i.status === "resolved");
      reconciliation_issues = allResolved ? "complete" : "in_progress";
    }

    let audit_trail: ModuleStatus = "not_started";
    if (auditCount > 0) audit_trail = "in_progress";

    let ai_assistant: ModuleStatus = "not_started";
    if ((chatResult.count ?? 0) > 0) ai_assistant = "in_progress";

    const workflowStatuses: ModuleStatus[] = [
      plan_details,
      participants,
      payroll_mapping,
      payroll_runs,
      reconciliation_issues,
      audit_trail,
      ai_assistant,
    ];

    let onboarding_home: ModuleStatus = "not_started";
    if (workflowStatuses.every((s) => s === "complete")) {
      onboarding_home = "complete";
    } else if (workflowStatuses.some((s) => s !== "not_started")) {
      onboarding_home = "in_progress";
    }

    const status: StatusMap = {
      onboarding_home,
      plan_details,
      participants,
      payroll_mapping,
      payroll_runs,
      reconciliation_issues,
      audit_trail,
      ai_assistant,
    };

    return NextResponse.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

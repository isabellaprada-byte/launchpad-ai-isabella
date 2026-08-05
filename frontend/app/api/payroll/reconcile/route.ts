import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { runPayrollReconciliationAgent } from "@/lib/agents/payroll-reconciliation-agent";

export async function POST(request: Request) {
  try {
    const { runId } = await request.json();
    if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

    const supabase = getSupabase();

    const [runResult, recordsResult, participantsResult, planResult, priorResult] =
      await Promise.all([
        supabase.from("payroll_runs").select("*").eq("id", runId).single(),
        supabase.from("payroll_records").select("*").eq("payroll_run_id", runId),
        supabase.from("participants").select("*"),
        supabase.from("plans").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("payroll_records").select("*, payroll_runs(run_number)").neq("payroll_run_id", runId),
      ]);

    if (runResult.error) throw runResult.error;
    if (recordsResult.error) throw recordsResult.error;
    if (participantsResult.error) throw participantsResult.error;
    if (planResult.error) throw planResult.error;
    if (priorResult.error) throw priorResult.error;

    const result = await runPayrollReconciliationAgent({
      payroll_records: recordsResult.data ?? [],
      participants: participantsResult.data ?? [],
      plan: planResult.data,
      prior_runs: priorResult.data ?? [],
      run_number: runResult.data.run_number,
    });

    const issueRows = [];
    const fixRows = [];

    for (const issue of result.issues) {
      const { data: issueData, error: issueError } = await supabase
        .from("reconciliation_issues")
        .insert({
          payroll_run_id: runId,
          employee_id: issue.employee_id,
          issue_type: issue.issue_type,
          severity: issue.severity,
          description: issue.description,
          agent_explanation: issue.agent_explanation,
          status: "open",
        })
        .select()
        .single();

      if (issueError) throw issueError;
      issueRows.push(issueData);

      await writeAuditLog({
        actor_type: "agent",
        actor_name: "payroll-reconciliation-agent",
        action: "ISSUE_CREATED",
        entity_type: "reconciliation_issue",
        entity_id: issueData.id,
        payroll_run_id: runId,
        employee_id: issue.employee_id ?? undefined,
        reason: issue.description,
        status: "open",
      });

      if (issue.suggested_fix) {
        const { data: fixData, error: fixError } = await supabase
          .from("suggested_fixes")
          .insert({
            issue_id: issueData.id,
            field_name: issue.suggested_fix.field_name,
            before_value: { value: issue.suggested_fix.before_value },
            after_value: { value: issue.suggested_fix.after_value },
            reason: issue.suggested_fix.reason,
            requires_approval: true,
            status: "pending",
          })
          .select()
          .single();

        if (fixError) throw fixError;
        fixRows.push(fixData);

        await writeAuditLog({
          actor_type: "agent",
          actor_name: "payroll-reconciliation-agent",
          action: "FIX_SUGGESTED",
          entity_type: "suggested_fix",
          entity_id: fixData.id,
          payroll_run_id: runId,
          employee_id: issue.employee_id ?? undefined,
          field_name: issue.suggested_fix.field_name,
          before_value: { value: issue.suggested_fix.before_value },
          after_value: { value: issue.suggested_fix.after_value },
          reason: issue.suggested_fix.reason,
          status: "pending",
        });
      }
    }

    await supabase.from("payroll_runs").update({ status: "reconciled" }).eq("id", runId);
    await writeAuditLog({
      actor_type: "agent",
      actor_name: "payroll-reconciliation-agent",
      action: "PAYROLL_VALIDATED",
      entity_type: "payroll_run",
      entity_id: runId,
      payroll_run_id: runId,
      reason: `Reconciliation complete. ${result.issues.length} issues found.`,
    });

    return NextResponse.json({ data: { issues: issueRows, fixes: fixRows } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

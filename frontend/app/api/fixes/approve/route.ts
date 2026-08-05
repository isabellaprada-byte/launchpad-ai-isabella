import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { fixId } = await request.json();
    if (!fixId) return NextResponse.json({ error: "fixId required" }, { status: 400 });

    const supabase = getSupabase();

    const { data: fix, error: fixError } = await supabase
      .from("suggested_fixes")
      .select("*, reconciliation_issues(payroll_run_id, employee_id)")
      .eq("id", fixId)
      .single();

    if (fixError) throw fixError;
    if (fix.status !== "pending") {
      return NextResponse.json({ error: "Fix is not pending" }, { status: 400 });
    }

    const issue = fix.reconciliation_issues as { payroll_run_id: string; employee_id: string };

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FIX_APPROVED",
      entity_type: "suggested_fix",
      entity_id: fixId,
      payroll_run_id: issue.payroll_run_id,
      employee_id: issue.employee_id,
      field_name: fix.field_name,
      before_value: fix.before_value,
      after_value: fix.after_value,
      reason: fix.reason,
      status: "approved",
    });

    await supabase.from("suggested_fixes").update({ status: "approved" }).eq("id", fixId);
    await supabase.from("reconciliation_issues").update({ status: "resolved" }).eq("id", fix.issue_id);

    if (fix.field_name && fix.after_value) {
      const newValue = (fix.after_value as Record<string, unknown>).value;
      await supabase
        .from("payroll_records")
        .update({ [fix.field_name]: newValue })
        .eq("payroll_run_id", issue.payroll_run_id)
        .eq("employee_id", issue.employee_id);
    }

    await writeAuditLog({
      actor_type: "system",
      actor_name: "system",
      action: "FIX_APPLIED",
      entity_type: "payroll_record",
      entity_id: fixId,
      payroll_run_id: issue.payroll_run_id,
      employee_id: issue.employee_id,
      field_name: fix.field_name,
      before_value: fix.before_value,
      after_value: fix.after_value,
      reason: fix.reason,
      status: "applied",
    });

    await supabase.from("suggested_fixes").update({ status: "applied" }).eq("id", fixId);

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

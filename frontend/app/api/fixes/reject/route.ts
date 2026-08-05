import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { fixId } = await request.json();
    if (!fixId) return NextResponse.json({ error: "fixId required" }, { status: 400 });

    const supabase = getSupabase();

    const { data: fix, error } = await supabase
      .from("suggested_fixes")
      .select("*, reconciliation_issues(payroll_run_id, employee_id)")
      .eq("id", fixId)
      .single();

    if (error) throw error;

    const issue = fix.reconciliation_issues as { payroll_run_id: string; employee_id: string };

    await supabase.from("suggested_fixes").update({ status: "rejected" }).eq("id", fixId);
    await supabase.from("reconciliation_issues").update({ status: "rejected" }).eq("id", fix.issue_id);

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FIX_REJECTED",
      entity_type: "suggested_fix",
      entity_id: fixId,
      payroll_run_id: issue.payroll_run_id,
      employee_id: issue.employee_id,
      field_name: fix.field_name,
      before_value: fix.before_value,
      after_value: fix.after_value,
      status: "rejected",
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import type { ColumnMapping } from "@/lib/agents/payroll-mapping-agent";

export async function POST(request: Request) {
  try {
    const { runId, mappings, rows } = await request.json() as {
      runId: string;
      mappings: ColumnMapping[];
      rows: Record<string, string>[];
    };

    if (!runId || !mappings?.length) {
      return NextResponse.json({ error: "runId and mappings are required" }, { status: 400 });
    }

    const mappingRows = mappings.map((m) => ({
      payroll_run_id: runId,
      source_column: m.source_column,
      target_field: m.suggested_target,
      confidence: m.confidence,
      status: "approved",
    }));

    const { error: mappingError } = await getSupabase()
      .from("payroll_mappings")
      .insert(mappingRows);

    if (mappingError) throw mappingError;

    const targetToSource = Object.fromEntries(
      mappings.filter((m) => m.suggested_target).map((m) => [m.suggested_target!, m.source_column])
    );

    const getNum = (row: Record<string, string>, field: string) => {
      const val = row[targetToSource[field]];
      return val ? parseFloat(val) || null : null;
    };

    const payrollRecords = rows.map((row) => ({
      payroll_run_id: runId,
      employee_id: row[targetToSource["employee_id"]] ?? null,
      raw_row: row,
      mapped_row: Object.fromEntries(
        mappings
          .filter((m) => m.suggested_target)
          .map((m) => [m.suggested_target!, row[m.source_column] ?? null])
      ),
      gross_wages: getNum(row, "gross_wages"),
      pretax_contribution: getNum(row, "pretax_contribution"),
      roth_contribution: getNum(row, "roth_contribution"),
      employer_match: getNum(row, "employer_match"),
      loan_repayment: getNum(row, "loan_repayment"),
      pay_date: row[targetToSource["pay_date"]] || null,
    }));

    const { error: recordsError } = await getSupabase()
      .from("payroll_records")
      .insert(payrollRecords);

    if (recordsError) throw recordsError;

    await getSupabase()
      .from("payroll_runs")
      .update({ status: "mapped" })
      .eq("id", runId);

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "MAPPING_APPROVED",
      entity_type: "payroll_run",
      entity_id: runId,
      payroll_run_id: runId,
      reason: `Approved mapping and saved ${payrollRecords.length} payroll records`,
    });

    return NextResponse.json({ data: { mappingsCount: mappingRows.length, recordsCount: payrollRecords.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

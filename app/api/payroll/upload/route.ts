import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const runNumber = Number(formData.get("runNumber") ?? 1);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const { headers, rows } = parseCSV(csvText);
    const supabase = getSupabase();

    const { data: run, error } = await supabase
      .from("payroll_runs")
      .insert({ run_number: runNumber, file_name: file.name, status: "uploaded" })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FILE_UPLOADED",
      entity_type: "payroll_run",
      entity_id: run.id,
      payroll_run_id: run.id,
      reason: `Uploaded payroll run ${runNumber}: ${file.name}`,
    });

    // For runs 2+, auto-apply the approved mapping and save records immediately
    if (runNumber > 1) {
      const { data: mappings, error: mapError } = await supabase
        .from("payroll_mappings")
        .select("*")
        .eq("status", "approved");

      if (mapError) throw mapError;

      if (mappings && mappings.length > 0) {
        const targetToSource = Object.fromEntries(
          mappings.filter((m) => m.target_field).map((m) => [m.target_field, m.source_column])
        );

        const getNum = (row: Record<string, string>, field: string) => {
          const val = row[targetToSource[field]];
          return val ? parseFloat(val) || null : null;
        };

        const payrollRecords = rows.map((row) => ({
          payroll_run_id: run.id,
          employee_id: row[targetToSource["employee_id"]] ?? null,
          raw_row: row,
          mapped_row: Object.fromEntries(
            mappings
              .filter((m) => m.target_field)
              .map((m) => [m.target_field, row[m.source_column] ?? null])
          ),
          gross_wages: getNum(row, "gross_wages"),
          pretax_contribution: getNum(row, "pretax_contribution"),
          roth_contribution: getNum(row, "roth_contribution"),
          employer_match: getNum(row, "employer_match"),
          loan_repayment: getNum(row, "loan_repayment"),
          pay_date: row[targetToSource["pay_date"]] || null,
        }));

        const { error: recordsError } = await supabase
          .from("payroll_records")
          .insert(payrollRecords);

        if (recordsError) throw recordsError;

        await supabase
          .from("payroll_runs")
          .update({ status: "mapped" })
          .eq("id", run.id);
      }
    }

    return NextResponse.json({ data: { run, headers, rows } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

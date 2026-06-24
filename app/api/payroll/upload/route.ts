import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

function splitCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[]; warning?: string } {
  if (!text.trim()) throw new Error("CSV file is empty");

  // normalize Windows line endings
  const lines = text.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length === 0) throw new Error("CSV file has no content");

  const headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ""));

  if (headers.every(h => !isNaN(Number(h)) || /^\d{4}-\d{2}-\d{2}$/.test(h))) {
    throw new Error("CSV appears to have no header row — first row contains data values, not column names");
  }

  const emptyHeaders = headers.filter(h => !h);
  if (emptyHeaders.length > 0) {
    throw new Error(`CSV has ${emptyHeaders.length} empty column header(s) — check for extra commas in the header row`);
  }

  const rows = lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      const values = splitCSVLine(line).map(v => v.replace(/^"|"$/g, ""));
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
    });

  const warning = rows.length === 0 ? "CSV has headers but no data rows" : undefined;
  return { headers, rows, ...(warning ? { warning } : {}) };
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

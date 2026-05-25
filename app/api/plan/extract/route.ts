import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import { runPlanExtractionAgent } from "@/lib/agents/plan-extraction-agent";

export async function POST(request: Request) {
  try {
    const { base64, fileName } = await request.json();

    if (!base64) {
      return NextResponse.json({ error: "No file data provided" }, { status: 400 });
    }

    const pdfBuffer = Buffer.from(base64, "base64");
    const result = await runPlanExtractionAgent(pdfBuffer);

    const fields = result.fields;
    const getValue = (key: string) => fields[key]?.value ?? null;

    const { data, error } = await getSupabase()
      .from("plans")
      .insert({
        company_name: getValue("company_name"),
        ein: getValue("ein"),
        plan_name: getValue("plan_name"),
        plan_effective_date: getValue("plan_effective_date"),
        eligibility_age: getValue("eligibility_age"),
        eligibility_service_months: getValue("eligibility_service_months"),
        entry_dates: getValue("entry_dates"),
        auto_enrollment: getValue("auto_enrollment"),
        auto_enrollment_rate: getValue("auto_enrollment_rate"),
        auto_escalation: getValue("auto_escalation"),
        auto_escalation_max: getValue("auto_escalation_max"),
        employer_match_formula: getValue("employer_match_formula"),
        safe_harbor: getValue("safe_harbor"),
        roth_permitted: getValue("roth_permitted"),
        loans_permitted: getValue("loans_permitted"),
        loan_max_outstanding: getValue("loan_max_outstanding"),
        loan_max_amount: getValue("loan_max_amount"),
        raw_extraction: fields,
        extraction_confidence: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v.confidence])
        ),
        flags: result.flags,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_type: "agent",
      actor_name: "plan-extraction-agent",
      action: "PLAN_EXTRACTED",
      entity_type: "plan",
      entity_id: data.id,
      reason: `Extracted plan details from ${fileName}. Flags: ${result.flags.length}`,
    });

    return NextResponse.json({ data: { plan: data, flags: result.flags } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

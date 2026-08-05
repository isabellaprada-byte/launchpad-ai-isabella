import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { runPayrollMappingAgent } from "@/lib/agents/payroll-mapping-agent";

export async function POST(request: Request) {
  try {
    const { columns, runId } = await request.json();

    if (!columns?.length) {
      return NextResponse.json({ error: "No columns provided" }, { status: 400 });
    }

    const result = await runPayrollMappingAgent(columns);

    await writeAuditLog({
      actor_type: "agent",
      actor_name: "payroll-mapping-agent",
      action: "MAPPING_SUGGESTED",
      entity_type: "payroll_run",
      entity_id: runId,
      payroll_run_id: runId,
      reason: `Suggested mapping for ${columns.length} columns`,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

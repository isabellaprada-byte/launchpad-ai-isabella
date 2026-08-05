import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";
import type { ParticipantRecord } from "@/lib/agents/participant-import-agent";

export async function POST(request: Request) {
  try {
    const { records } = await request.json() as { records: ParticipantRecord[] };

    if (!records?.length) {
      return NextResponse.json({ error: "No records provided" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("participants")
      .upsert(records, { onConflict: "employee_id" })
      .select();

    if (error) throw error;

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FILE_UPLOADED",
      entity_type: "participants",
      entity_id: "census-import",
      reason: `Imported ${records.length} participant records`,
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

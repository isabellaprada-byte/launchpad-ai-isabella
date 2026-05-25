import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { planId, field, value, previousValue } = await request.json();

    if (!planId || !field) {
      return NextResponse.json({ error: "planId and field are required" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("plans")
      .update({ [field]: value })
      .eq("id", planId)
      .select()
      .single();

    if (error) throw error;

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FIELD_UPDATED",
      entity_type: "plan",
      entity_id: planId,
      field_name: field,
      before_value: { value: previousValue },
      after_value: { value },
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

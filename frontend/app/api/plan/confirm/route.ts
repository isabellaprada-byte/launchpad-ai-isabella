import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const { planId } = await request.json();

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("plans")
      .update({ status: "approved" })
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
      field_name: "status",
      before_value: { value: "pending" },
      after_value: { value: "approved" },
      reason: "User confirmed plan details",
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

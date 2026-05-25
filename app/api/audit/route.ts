import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const actor_type = searchParams.get("actor_type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let query = getSupabase()
      .from("audit_logs")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);

    if (action) query = query.eq("action", action);
    if (actor_type) query = query.eq("actor_type", actor_type);
    if (from) query = query.gte("timestamp", from);
    if (to) query = query.lte("timestamp", to);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

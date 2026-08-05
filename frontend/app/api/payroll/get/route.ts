import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type === "mapping") {
      const { data, error } = await getSupabase()
        .from("payroll_mappings")
        .select("*")
        .eq("status", "approved")
        .limit(1);
      if (error) throw error;
      return NextResponse.json({ data: { approved: (data?.length ?? 0) > 0 } });
    }

    const { data, error } = await getSupabase()
      .from("payroll_runs")
      .select("*")
      .order("run_number", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { getSupabase } from "@/lib/supabase";

export type ToolName =
  | "get_plan_details"
  | "get_participant_records"
  | "get_payroll_runs"
  | "get_reconciliation_issues"
  | "get_audit_logs";

export const toolDefinitions = [
  {
    name: "get_plan_details",
    description:
      "Get the extracted plan details for the Acme Robotics 401(k) plan including EIN, match formula, eligibility rules, and any flags.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_participant_records",
    description:
      "Get participant records from the census. Optionally filter by status (active, terminated, leave, ineligible).",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: active, terminated, leave, ineligible",
        },
        limit: { type: "number", description: "Max records to return (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "get_payroll_runs",
    description: "Get the list of payroll runs with their run number, file name, pay date, and status.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_reconciliation_issues",
    description:
      "Get reconciliation issues. Optionally filter by severity (error, warning, info) or status (open, resolved, rejected).",
    input_schema: {
      type: "object",
      properties: {
        severity: { type: "string", description: "error | warning | info" },
        status: { type: "string", description: "open | resolved | rejected" },
        payroll_run_id: { type: "string", description: "Filter by specific payroll run ID" },
      },
      required: [],
    },
  },
  {
    name: "get_audit_logs",
    description: "Get the audit trail of all actions taken in the system.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Filter by action type e.g. FIX_APPROVED" },
        limit: { type: "number", description: "Max records to return (default 20)" },
      },
      required: [],
    },
  },
] as const;

type ToolInput = Record<string, unknown>;

export async function executeTool(name: ToolName, input: ToolInput): Promise<unknown> {
  const supabase = getSupabase();

  switch (name) {
    case "get_plan_details": {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    }

    case "get_participant_records": {
      let query = supabase.from("participants").select("*");
      if (input.status) query = query.eq("status", input.status as string);
      const { data, error } = await query.limit((input.limit as number) ?? 50);
      if (error) throw error;
      return { count: data?.length, records: data };
    }

    case "get_payroll_runs": {
      const { data, error } = await supabase
        .from("payroll_runs")
        .select("*")
        .order("run_number", { ascending: true });
      if (error) throw error;
      return data;
    }

    case "get_reconciliation_issues": {
      let query = supabase.from("reconciliation_issues").select("*, suggested_fixes(*)");
      if (input.severity) query = query.eq("severity", input.severity as string);
      if (input.status) query = query.eq("status", input.status as string);
      if (input.payroll_run_id) query = query.eq("payroll_run_id", input.payroll_run_id as string);
      const { data, error } = await query;
      if (error) throw error;
      return { count: data?.length, issues: data };
    }

    case "get_audit_logs": {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("timestamp", { ascending: false });
      if (input.action) query = query.eq("action", input.action as string);
      const { data, error } = await query.limit((input.limit as number) ?? 20);
      if (error) throw error;
      return data;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

import { getSupabase } from "@/lib/supabase";

interface AuditLogEntry {
  actor_type: "user" | "agent" | "system";
  actor_name: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  payroll_run_id?: string;
  employee_id?: string;
  field_name?: string;
  before_value?: unknown;
  after_value?: unknown;
  reason?: string;
  status?: string;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const { error } = await getSupabase().from("audit_logs").insert({
    ...entry,
    before_value: entry.before_value !== undefined ? entry.before_value : null,
    after_value: entry.after_value !== undefined ? entry.after_value : null,
  });
  if (error) throw error;
}

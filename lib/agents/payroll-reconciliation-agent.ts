import { anthropic } from "@/lib/anthropic";
import fs from "fs";
import path from "path";

export interface ReconciliationIssue {
  employee_id: string | null;
  issue_type: string;
  severity: "error" | "warning" | "info";
  description: string;
  agent_explanation: string;
  suggested_fix: {
    field_name: string;
    before_value: unknown;
    after_value: unknown;
    reason: string;
  } | null;
}

export interface ReconciliationResult {
  issues: ReconciliationIssue[];
}

const skillPath = path.join(process.cwd(), "skills/payroll-reconciliation/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf-8");

export async function runPayrollReconciliationAgent(input: {
  payroll_records: unknown[];
  participants: unknown[];
  plan: unknown;
  prior_runs: unknown[];
  run_number: number;
}): Promise<ReconciliationResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: `You are a 401(k) payroll reconciliation specialist. Follow these instructions exactly:\n\n${skill}`,
    messages: [
      {
        role: "user",
        content: `Reconcile the following payroll run data. Return only valid JSON matching the output format. No prose, no markdown fences — just raw JSON.\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Agent returned no JSON");

  return JSON.parse(jsonMatch[0]) as ReconciliationResult;
}

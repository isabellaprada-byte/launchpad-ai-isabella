import { anthropic } from "@/lib/anthropic";
import fs from "fs";
import path from "path";

export interface ParticipantRecord {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  hire_date: string | null;
  termination_date: string | null;
  status: string;
  annual_salary: number | null;
  deferral_rate_pretax: number | null;
  deferral_rate_roth: number | null;
}

export interface ParticipantFlag {
  employee_id: string;
  field: string;
  description: string;
}

export interface ParticipantImportResult {
  records: ParticipantRecord[];
  flags: ParticipantFlag[];
}

const skillPath = path.join(process.cwd(), "skills/participant-import/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf-8");

export async function runParticipantImportAgent(
  csvText: string
): Promise<ParticipantImportResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: `You are a participant data normalization specialist for 401(k) plans. Follow these instructions exactly:\n\n${skill}`,
    messages: [
      {
        role: "user",
        content: `Normalize the following participant census CSV data. Return only valid JSON matching the output format. No prose, no markdown code fences — just the raw JSON object.\n\nCSV DATA:\n${csvText}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Agent returned no JSON");

  return JSON.parse(jsonMatch[0]) as ParticipantImportResult;
}

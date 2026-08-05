import { anthropic } from "@/lib/anthropic";
import fs from "fs";
import path from "path";

export interface ColumnMapping {
  source_column: string;
  suggested_target: string | null;
  confidence: "high" | "medium" | "low";
  ambiguous: boolean;
  ambiguity_reason?: string;
}

export interface MappingResult {
  mappings: ColumnMapping[];
}

const skillPath = path.join(process.cwd(), "skills/payroll-mapping/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf-8");

export async function runPayrollMappingAgent(
  columns: string[]
): Promise<MappingResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are a payroll column mapping specialist for 401(k) plans. Follow these instructions exactly:\n\n${skill}`,
    messages: [
      {
        role: "user",
        content: `Map the following CSV column headers to system target fields. Return only valid JSON matching the output format. No prose, no markdown fences — just raw JSON.\n\nColumns: ${JSON.stringify(columns)}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Agent returned no JSON");

  return JSON.parse(jsonMatch[0]) as MappingResult;
}

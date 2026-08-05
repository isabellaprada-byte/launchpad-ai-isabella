import { anthropic } from "@/lib/anthropic";
import fs from "fs";
import path from "path";

export interface ExtractedField {
  value: unknown;
  confidence: "high" | "medium" | "low";
}

export interface ExtractionFlag {
  field: string;
  description: string;
  severity: "error" | "warning" | "info";
}

export interface ExtractionResult {
  fields: Record<string, ExtractedField>;
  flags: ExtractionFlag[];
}

const skillPath = path.join(process.cwd(), "skills/plan-extraction/SKILL.md");
const skill = fs.readFileSync(skillPath, "utf-8");

export async function runPlanExtractionAgent(
  pdfBuffer: Buffer
): Promise<ExtractionResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are a 401(k) plan document extraction specialist. Follow these instructions exactly:\n\n${skill}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Extract all plan details from this document. Return only valid JSON matching the output format in your instructions. No prose, no markdown code fences — just the raw JSON object.",
          },
        ],
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Agent returned no JSON");

  return JSON.parse(jsonMatch[0]) as ExtractionResult;
}

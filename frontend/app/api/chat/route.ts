import { NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { toolDefinitions, executeTool, ToolName } from "@/lib/mcp/tools";
import { writeAuditLog } from "@/lib/audit";
import { readFileSync } from "fs";
import { join } from "path";
import type { MessageParam, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: MessageParam[] };
    if (!messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const skillPath = join(process.cwd(), "skills/onboarding-assistant/SKILL.md");
    const systemPrompt = readFileSync(skillPath, "utf-8");

    const userMessage = messages[messages.length - 1];
    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "CHAT_QUESTION_ASKED",
      entity_type: "chat",
      reason:
        typeof userMessage.content === "string"
          ? userMessage.content.slice(0, 500)
          : "Chat question",
    });

    const loopMessages: MessageParam[] = [...messages];

    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: toolDefinitions as any,
      messages: loopMessages,
    });

    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          await writeAuditLog({
            actor_type: "agent",
            actor_name: "onboarding-assistant",
            action: "MCP_TOOL_CALLED",
            entity_type: "tool",
            entity_id: block.name,
            reason: `Tool called during chat`,
          });

          try {
            const result = await executeTool(
              block.name as ToolName,
              block.input as Record<string, unknown>
            );
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          } catch (err) {
            return {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
              is_error: true,
            };
          }
        })
      );

      loopMessages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: toolDefinitions as any,
        messages: loopMessages,
      });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    return NextResponse.json({
      reply: textBlock?.type === "text" ? textBlock.text : "",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

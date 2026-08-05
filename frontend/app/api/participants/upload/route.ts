import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { runParticipantImportAgent } from "@/lib/agents/participant-import-agent";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FILE_UPLOADED",
      entity_type: "file",
      entity_id: file.name,
      reason: `Uploaded participant census: ${file.name}`,
    });

    const result = await runParticipantImportAgent(csvText);

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

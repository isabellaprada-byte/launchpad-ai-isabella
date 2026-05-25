import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "FILE_UPLOADED",
      entity_type: "file",
      entity_id: file.name,
      reason: `Uploaded plan PDF: ${file.name}`,
    });

    return NextResponse.json({
      data: {
        fileName: file.name,
        fileSize: file.size,
        base64,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

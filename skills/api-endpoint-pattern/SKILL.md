# Skill: API Endpoint Pattern

Every Next.js API route in this project follows this exact shape. Do not deviate.

## GET route

```ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { data, error } = await supabase.from("table_name").select("*");
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## POST route

```ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.required_field) {
      return NextResponse.json({ error: "required_field is required" }, { status: 400 });
    }

    // Do the work
    const { data, error } = await supabase.from("table_name").insert(body).select().single();
    if (error) throw error;

    // Always write audit log after successful mutations
    await writeAuditLog({
      actor_type: "user",
      actor_name: "user",
      action: "ACTION_NAME",
      entity_type: "entity",
      entity_id: data.id,
    });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## Rules

- Always use `try/catch` — never let an unhandled error reach the client
- Always return `{ data }` on success, `{ error: message }` on failure
- Validate required fields at the top before doing any DB work
- Write an audit log after every successful mutation
- Never use the Supabase anon client in API routes — always use the service role client from `@/lib/supabase`
- Never expose raw Supabase error objects to the client — extract `.message`

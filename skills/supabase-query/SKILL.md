# Skill: Supabase Query Conventions

## Client setup

Always import the server-side client. Never create a new client inline.

```ts
import { supabase } from "@/lib/supabase";
```

This client uses the **service role key** and must only be used in:
- `app/api/**` routes
- `lib/agents/**` files
- `lib/mcp/**` files

Never import it in React components or `app/**/page.tsx` files.

## Error handling

Always destructure `{ data, error }` and throw on error:

```ts
const { data, error } = await supabase.from("plans").select("*").single();
if (error) throw error;
```

Never swallow errors or return `null` silently.

## Common patterns

```ts
// Insert and return the new row
const { data, error } = await supabase
  .from("table")
  .insert({ field: value })
  .select()
  .single();

// Upsert on unique constraint
const { data, error } = await supabase
  .from("participants")
  .upsert(records, { onConflict: "employee_id" })
  .select();

// Update a specific row
const { data, error } = await supabase
  .from("table")
  .update({ field: newValue })
  .eq("id", id)
  .select()
  .single();

// Query with filters
const { data, error } = await supabase
  .from("reconciliation_issues")
  .select("*")
  .eq("payroll_run_id", runId)
  .eq("status", "open")
  .order("created_at", { ascending: false });
```

## Rules

- Never use `.single()` unless you are certain exactly one row will match — use `.maybeSingle()` when the row might not exist
- Never use the anon key on the server — always service role
- `NEXT_PUBLIC_` keys are safe for the browser; `SUPABASE_SERVICE_ROLE_KEY` is server-only

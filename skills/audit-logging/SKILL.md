# Skill: Audit Logging

Every meaningful action writes a row to `audit_logs`. This is the spine of the app.

## `writeAuditLog()` signature

```ts
// lib/audit.ts
writeAuditLog(entry: {
  actor_type: "user" | "agent" | "system";
  actor_name: string;
  action: string;               // see valid values below
  entity_type?: string;
  entity_id?: string;
  payroll_run_id?: string;
  employee_id?: string;
  field_name?: string;
  before_value?: unknown;
  after_value?: unknown;
  reason?: string;
  status?: string;
}): Promise<void>
```

## Valid `action` values

| Action | When to use |
|---|---|
| `FILE_UPLOADED` | User uploads any file |
| `PLAN_EXTRACTED` | Plan extraction agent returns results |
| `FIELD_UPDATED` | User manually edits a plan field |
| `MAPPING_SUGGESTED` | Payroll mapping agent proposes column mappings |
| `MAPPING_APPROVED` | User approves a column mapping |
| `PAYROLL_VALIDATED` | A payroll run has been reconciled |
| `ISSUE_CREATED` | Reconciliation agent creates an issue |
| `FIX_SUGGESTED` | Agent proposes a fix for an issue |
| `FIX_APPROVED` | User approves a fix |
| `FIX_REJECTED` | User rejects a fix |
| `FIX_APPLIED` | System applies an approved fix to data |
| `CHAT_QUESTION_ASKED` | User sends a message to the assistant |
| `MCP_TOOL_CALLED` | Assistant invokes an MCP tool |

## Examples

```ts
// File uploaded
await writeAuditLog({
  actor_type: "user",
  actor_name: "user",
  action: "FILE_UPLOADED",
  entity_type: "file",
  entity_id: fileName,
});

// Fix suggested by agent
await writeAuditLog({
  actor_type: "agent",
  actor_name: "payroll-reconciliation-agent",
  action: "FIX_SUGGESTED",
  entity_type: "reconciliation_issue",
  entity_id: issueId,
  employee_id: employeeId,
  payroll_run_id: runId,
  field_name: fieldName,
  before_value: beforeValue,
  after_value: afterValue,
  reason: "Explanation of why this fix is suggested",
  status: "pending",
});

// Fix applied by system after approval
await writeAuditLog({
  actor_type: "system",
  actor_name: "system",
  action: "FIX_APPLIED",
  entity_type: "payroll_record",
  entity_id: recordId,
  employee_id: employeeId,
  field_name: fieldName,
  before_value: beforeValue,
  after_value: afterValue,
  status: "applied",
});
```

## Rules

- Never skip the audit log after a mutation — it is the source of truth
- `before_value` and `after_value` are `jsonb` — wrap primitives in an object: `{ value: "old" }`
- `status` on a `FIX_SUGGESTED` entry is always `"pending"` until actioned
- Agent entries use `actor_type: "agent"` and set `actor_name` to the agent's identifier

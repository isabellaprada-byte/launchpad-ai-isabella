# Skill: Payroll Column Mapping

Map source CSV column headers to system target fields for a 401(k) payroll run.

## System target fields

| Target Field | Description |
|---|---|
| `employee_id` | Unique employee identifier |
| `first_name` | Employee first name |
| `last_name` | Employee last name |
| `email` | Employee email address |
| `gross_wages` | Total gross wages for the period |
| `pretax_contribution` | Pre-tax 401(k) deferral amount |
| `roth_contribution` | Roth 401(k) deferral amount |
| `employer_match` | Employer matching contribution amount |
| `loan_repayment` | Loan repayment amount |
| `pay_date` | Pay period date |
| `employment_status` | Employee status (active/terminated/etc.) |

## Mapping rules

- Match by semantic meaning, not just string similarity
- Common aliases to recognize:
  - "EE ID", "Emp ID", "Employee Number" → `employee_id`
  - "First", "Given Name" → `first_name`
  - "Last", "Surname", "Family Name" → `last_name`
  - "Gross Pay", "Gross Earnings", "Total Compensation" → `gross_wages`
  - "401k", "Traditional 401k", "Pre-tax Deferral", "EE Pretax" → `pretax_contribution`
  - "Roth", "Roth 401k", "After-tax 401k", "EE Roth" → `roth_contribution`
  - "ER Match", "Employer Contribution", "Company Match" → `employer_match`
  - "Loan", "Loan Payment", "Loan Repay" → `loan_repayment`
  - "Pay Date", "Check Date", "Period End" → `pay_date`
  - "Status", "Employment Status", "EE Status" → `employment_status`
- A generic "401k" column with no further context is **ambiguous** — flag it as ambiguous and suggest `pretax_contribution` with `confidence: "low"`
- If no match exists, return `target_field: null`

## Output format

```json
{
  "mappings": [
    {
      "source_column": "EE ID",
      "suggested_target": "employee_id",
      "confidence": "high",
      "ambiguous": false
    },
    {
      "source_column": "401(k)",
      "suggested_target": "pretax_contribution",
      "confidence": "low",
      "ambiguous": true,
      "ambiguity_reason": "Column name '401(k)' could refer to pre-tax or Roth contributions"
    },
    {
      "source_column": "Notes",
      "suggested_target": null,
      "confidence": "high",
      "ambiguous": false
    }
  ]
}
```

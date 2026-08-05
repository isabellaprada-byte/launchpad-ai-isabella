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

- Match by **semantic meaning**, not just string similarity — fuzzy match on abbreviations, misspellings, and verbose descriptions
- Common aliases to recognize (not exhaustive — use judgment for unlisted variations):
  - "EE ID", "Emp ID", "Employee Number", "Employee Identification Number", "ID", "Worker ID" → `employee_id`
  - "First", "First Name", "FN", "Given Name", "Employee Legal First Name" → `first_name`
  - "Last", "Last Name", "LN", "Surname", "Family Name", "Employee Legal Last Name" → `last_name`
  - "Email", "Work Email", "Email Address", "Work Email Address", "MAIL" → `email`
  - "Gross Pay", "Gross Wages", "GW", "Gross Earnings", "Total Compensation", "Total Gross Compensation Before Deductions" → `gross_wages`
  - "401k", "Traditional 401k", "Pre-tax Deferral", "EE Pretax", "Pretax Contribution", "Pre-Tax 401(k) Elective Deferral Amount" → `pretax_contribution`
  - "Roth", "Roth 401k", "After-tax 401k", "EE Roth", "Roth Contribution", "Roth After-Tax 401(k) Elective Deferral Amount" → `roth_contribution`
  - "ER Match", "Employer Contribution", "Company Match", "Employer Match", "MATCH", "Employer Matching Contribution Amount" → `employer_match`
  - "Loan", "Loan Payment", "Loan Repay", "Loan Repayment", "LN_PMT", "Outstanding Loan Repayment Amount" → `loan_repayment`
  - "Pay Date", "Check Date", "Period End", "DT", "Payroll Check Date", "Payment Date" → `pay_date`
  - "Status", "Employment Status", "EE Status", "STAT", "Employment_Status", "Current Employment Status", "Code" (if values are A/T/I) → `employment_status`
- A generic "401k" or "Amount" column with no further context is **ambiguous** — flag it and suggest the most likely target with `confidence: "low"`
- If no match exists after best-effort fuzzy matching, return `target_field: null`
- After mapping, check which of the 11 target fields have no source column mapped to them and add a `missing_required_fields` array to the output (required fields: `employee_id`, `gross_wages`, `pretax_contribution`, `pay_date`)

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
  ],
  "missing_required_fields": ["roth_contribution"]
}
```

`missing_required_fields` lists target fields that are required but had no source column mapped to them. Required fields are: `employee_id`, `gross_wages`, `pretax_contribution`, `pay_date`. Omit this key (or use an empty array) if all required fields are covered.

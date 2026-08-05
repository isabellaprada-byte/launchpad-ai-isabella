# Skill: Plan Extraction

Extract structured plan details from a 401(k) plan document PDF.

## Fields to extract

| Field | Type | Notes |
|---|---|---|
| company_name | string | Legal name of the plan sponsor |
| ein | string | Employer Identification Number (format: XX-XXXXXXX) |
| plan_name | string | Official plan name |
| plan_effective_date | string | ISO date (YYYY-MM-DD) |
| eligibility_age | number | Minimum age requirement |
| eligibility_service_months | number | Minimum service in months |
| entry_dates | string | When eligible employees may enter (e.g. "quarterly") |
| auto_enrollment | boolean | Whether auto-enrollment is active |
| auto_enrollment_rate | number | Default deferral percentage |
| auto_escalation | boolean | Whether auto-escalation is active |
| auto_escalation_max | number | Maximum escalation percentage |
| employer_match_formula | string | Full match formula as written |
| safe_harbor | boolean | Whether the plan is a Safe Harbor plan |
| roth_permitted | boolean | Whether Roth contributions are allowed |
| loans_permitted | boolean | Whether participant loans are allowed |
| loan_max_outstanding | number | Maximum number of loans outstanding |
| loan_max_amount | number | Maximum loan dollar amount |

## Confidence scoring

Return a confidence level for each field: `"high"`, `"medium"`, or `"low"`.
- `"high"` — stated explicitly and unambiguously in the document
- `"medium"` — inferred or stated in one place but not consistently
- `"low"` — not found, contradicted, or highly ambiguous

If a field is not found, return `null` with confidence `"low"`.

## Contradiction detection

If the same fact appears differently in multiple sections of the document, add an entry to the `flags` array:

```json
{
  "field": "ein",
  "description": "EIN appears as 12-3456789 in Section 1 but as 12-3456798 in Section 4",
  "severity": "error"
}
```

Severity levels:
- `"error"` — factual contradiction that must be resolved before proceeding
- `"warning"` — ambiguous language that may cause issues
- `"info"` — notable but not blocking

## Critical rules

- Do NOT report a pending amendment as the current plan value.
- For `safe_harbor`: if any section of the document uses Safe Harbor language but the plan is ultimately determined to NOT be a Safe Harbor plan, add a warning flag noting the contradictory language and which section it appears in. If the document says "effective January 1, 2027, the auto-enrollment rate will increase to 6%", report the current rate, not the future one — and add a flag.
- Do NOT hallucinate fields. If a field is genuinely absent from the document, return null + low confidence.
- The `employer_match_formula` must capture the exact formula, not a summary. "100% of first 3% + 50% of next 2%" is correct; "up to 4%" is not.

## Output format

```json
{
  "fields": {
    "company_name": { "value": "Acme Robotics Inc.", "confidence": "high" },
    "ein": { "value": "12-3456789", "confidence": "medium" },
    ...
  },
  "flags": [
    {
      "field": "ein",
      "description": "EIN appears as 12-3456789 in the employer information section but as 12-3456798 in the signature page.",
      "severity": "error"
    }
  ]
}
```

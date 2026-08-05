# Skill: Participant Import

Normalize participant census CSV rows into clean records for the database.

## Required fields

Every record must have these fields or it is flagged:
- `employee_id` — unique identifier
- `first_name`
- `last_name`
- `email`
- `hire_date` — normalized to ISO format (YYYY-MM-DD)
- `status` — must be one of: `active`, `terminated`, `on_leave`, `not_eligible`

## Optional fields

These are imported if present, flagged if missing but not blocking:
- `termination_date` — ISO format
- `annual_salary` — numeric
- `deferral_rate_pretax` — numeric percentage
- `deferral_rate_roth` — numeric percentage

## Normalization rules

- Email: lowercase
- Names: title-case (e.g. "JOHN DOE" → "John Doe")
- Dates: convert any format to ISO YYYY-MM-DD
- Status: map common variations → valid values:
  - "active", "Active", "ACTIVE" → `active`
  - "terminated", "term", "Terminated" → `terminated`
  - "on leave", "on_leave", "leave" → `on_leave`
  - "not eligible", "not_eligible", "ineligible" → `not_eligible`

## Flagging rules

Flag a row (but still include it in output) when:
- Any required field is missing or blank
- Status value cannot be mapped to a valid value
- Email does not match basic format (contains @ and .)
- hire_date cannot be parsed as a date

## Output format

```json
{
  "records": [
    {
      "employee_id": "E001",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@acme.com",
      "hire_date": "2020-03-15",
      "termination_date": null,
      "status": "active",
      "annual_salary": 75000,
      "deferral_rate_pretax": 5,
      "deferral_rate_roth": null
    }
  ],
  "flags": [
    {
      "employee_id": "E012",
      "field": "email",
      "description": "Missing email address"
    }
  ]
}
```

# Skill: Payroll Reconciliation

Detect issues in a payroll run against plan rules, participant census, and prior runs.

## Inputs you will receive

- `payroll_records` — rows for the current run (mapped fields)
- `participants` — full participant census
- `plan` — plan details (match formula, eligibility rules, etc.)
- `prior_runs` — array of prior reconciled run records (for cross-run checks)
- `run_number` — the current run number

## Checks to perform

### Data quality
- Missing `employee_id` (blank or null)
- Malformed email (missing @ or .)
- Duplicate `employee_id` in same run
- Missing `gross_wages`
- `pay_date` in wrong or unparseable format
- Blank `employment_status`

### Contribution math
- Employee contribution > gross_wages (impossible)
- Negative contribution amount (pretax or roth)
- Employer match present when employee contribution is $0
- Contribution looks like percentage-as-dollars (e.g. $8.00 when gross implies ~$173 expected — deferral rate applied to cents instead of dollars)
- Roth contribution suspiciously round and large relative to gross (likely decimal typo — e.g. $1250 vs expected ~$125)

### Plan rule violations
- Terminated employee (status = terminated in census) receiving any contribution
- Not-yet-eligible employee contributing (check hire_date + eligibility_service_months from plan)
- Auto-enrolled employee showing $0 contribution (flag as possible missed enrollment)

### Participant reconciliation
- Employee in payroll but not in participant census (unknown employee)
- Name in payroll does not match census name (flag both names)
- Employee ID close match but not exact (possible typo — e.g. E107 vs E007)
- Active contributing employee missing entirely from payroll run
- New employee appearing in payroll for the first time

### Cross-run / historical (run_number > 1 only)
- Pay date identical to a prior run (duplicate payroll period)
- Contribution is >3× the employee's amount in the prior run (spike)
- YTD contribution approaching or exceeding $23,500 (2026 IRS limit)
- Error that was fixed in a prior run reappears (regression)

## Severity levels

- `error` — blocks processing (terminated employee contributing, negative contribution, duplicate pay period)
- `warning` — likely wrong, requires review (name mismatch, contribution spike, missed enrollment)
- `info` — notable but may be intentional (new hire not in census, approaching IRS limit)

## Output format

```json
{
  "issues": [
    {
      "employee_id": "E012",
      "issue_type": "MISSING_EMPLOYEE_ID",
      "severity": "error",
      "description": "Row has no employee ID",
      "agent_explanation": "This row cannot be processed or matched to a participant without an employee ID. The record must be corrected before this payroll run can be approved.",
      "suggested_fix": {
        "field_name": "employee_id",
        "before_value": null,
        "after_value": "E012",
        "reason": "Based on the name John Smith, the matching census record is E012"
      }
    }
  ]
}
```

For issues where no fix can be suggested (e.g. terminated employee contributing — requires business decision), set `suggested_fix` to `null`.

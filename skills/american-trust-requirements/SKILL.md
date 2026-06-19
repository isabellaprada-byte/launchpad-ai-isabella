# Skill: American Trust Extra Requirements Extractor

Scan Gmail for emails from American Trust, extract every extra requirement or question they ask before sending final documents or after receiving a plan — and present them as a catalog so you can gather the information proactively from sponsors.

---

## Purpose

Before American Trust sends final plan documents, or shortly after receiving a new plan, they often ask for extra information that requires going back to the sponsor. These requests are scattered across email threads and easy to miss. This skill reads all American Trust emails and surfaces a clean catalog of every type of extra requirement they ask for — so you can collect the information from sponsors *before* AT asks for it.

The output is a **requirements catalog**, not a task tracker. Think of it as: "Here are all the things AT will ask you about — grouped by type."

---

## How to invoke

Tell Claude:

> "Use the american-trust-requirements skill and pull all the extra requirements American Trust asks for"

Or with a custom contact / company:

> "Use the american-trust-requirements skill, contact is John Smith at Fidelity"

---

## What counts as an "extra requirement"

Look for any email where American Trust:
- Asks for a document, form, or file from the sponsor or ForUs
- Asks a question that requires going back to the plan sponsor to answer
- Flags an issue (LexisNexis failure, compliance concern, missing signature) that requires sponsor input
- Asks for clarification on plan design, entity structure, prior plans, or business history

Do NOT include:
- Routine "plan setup complete, ready for funding" notifications
- Plan document signing requests (expected part of every onboarding, not an extra requirement)
- Missing signature follow-ups (routine)
- Effective date changes requested by the sponsor (routine doc update, not a new requirement)
- Meeting notes with only status updates
- ACH/billing notifications
- DocuSign sent/viewed/completed notifications
- Census data completion requests (routine sponsor action, not an extra AT requirement)
- Eligibility or document corrections AT makes internally (technical fix to docs, not a request for extra sponsor information)

---

## Configuration

| Parameter | Default | How to override |
|---|---|---|
| Contact name | `Amy Day` | Mention a different name in your request |
| Custodian company | `American Trust` | Mention a different company in your request |
| Lookback window | All time | Say "last 90 days" or a specific date range |

---

## Search strategy

Run the following Gmail search:

```
from:americantrust.com OR "Amy Day" OR "American Trust"
```

For each result:
1. Fetch the **full message body** — do not rely on subject or snippet
2. If the message is part of a thread, fetch the **entire thread**
3. Focus on messages **from** American Trust (not sent by ForUs/Isabella)

---

## Extraction rules

For each requirement found, extract:

| Field | What to capture |
|---|---|
| `requirement_type` | Category (see classification guide below) |
| `trigger` | What condition causes AT to ask for this (e.g. "LexisNexis couldn't verify EIN", "plan wants to count prior service") |
| `what_is_needed` | Exactly what AT is asking for, in their words |
| `what_is_acceptable` | Specific forms of the document or information they will accept (if stated) |
| `what_is_not_acceptable` | Explicit rejections — NEVER summarize these away |
| `who_to_ask` | Whether to ask the plan sponsor, ForUs legal/compliance, or another party |
| `example_plan` | A real plan name from your emails where this was triggered (for context) |
| `at_contact` | Which AT person asked (Amy Day, Scott Wells, Document Team, Compliance Team, etc.) |

### Requirement type classification

| Type | When to use |
|---|---|
| `EIN_VERIFICATION` | AT couldn't verify EIN via LexisNexis — needs government document from sponsor |
| `BENEFIT_ANALYSIS` | AT sends a BA and asks ForUs to review with sponsor, fill in final design, and return |
| `PRIOR_ENTITY / RELATED_COMPANIES` | Plan wants to count service from a prior entity — AT needs entity relationships and ownership info from sponsor |
| `BUSINESS_ACQUISITION` | AT flags a prior acquisition — needs purchase type, purchase agreement, prior plan history from sponsor |
| `PRIOR_PLAN_VERIFICATION` | AT flags prior 5500 filings under same EIN — needs confirmation from sponsor that plans were terminated and assets distributed |
| `RESIDUAL_FUNDS` | AT received money from prior recordkeeper and needs sponsor/ForUs to provide breakdown and allocation instructions |
| `COMPLIANCE_HOLD` | AT's compliance or document team is holding plan setup pending additional info from sponsor |
| `PLAN_AMENDMENT` | Sponsor requests a mid-setup plan design change — AT needs sponsor to confirm the change in writing and return a signed amendment |
| `PLAN_NEVER_FUNDED / OPERATIONAL_FAILURE` | Prior plan had zero assets — AT won't accept as Trustee until sponsor explains what happened (possible operational failure) |
| `AUTO_ENROLLMENT_CONFIRMATION` | AT needs written confirmation from sponsor of the exact auto-enrollment escalation rate; triggers 30-day EACA notice period before effective date |
| `TERMINATED_PARTICIPANT_FEES` | AT asks ForUs to confirm with sponsor which fee categories terminated participants will pay vs. the plan sponsor paying on their behalf |
| `DISTRIBUTION_FRAUD_VERIFICATION` | AT's GIACT/ABA system flags a participant's distribution as suspicious — AT asks the plan sponsor to confirm the request and banking details are legitimate before releasing funds |
| `ROLLOVER_ROTH_INFO` | AT receives an incoming Roth rollover — asks ForUs to confirm with the prior recordkeeper the Roth basis and initial year of contribution before processing |
| `OTHER` | Anything that doesn't fit above |

### Critical rules

- **Capture the "not acceptable" condition verbatim** — this is the most important part of EIN requests and others. Never summarize it away.
- If the same requirement type appears for multiple plans, **list each plan separately** under that requirement type.
- If AT gives specific examples of acceptable documents, list every example they give.
- Include the real plan name as an example — it makes the catalog concrete and memorable.

---

## Output format

Group by requirement type, not by plan. The goal is a reusable catalog.

```
## American Trust — Extra Requirements Catalog
Generated: [today's date] · Source: [user's email]

---

### [REQUIREMENT_TYPE]

**Trigger:** [what causes AT to ask for this]
**Who to ask:** [sponsor / ForUs legal / other]
**AT contact:** [Amy Day / Document Team / etc.]

**What they need:**
- [item 1]
- [item 2]

**Acceptable forms:**
- [accepted document or answer format]

**NOT acceptable:** [explicit rejection, verbatim]  ← omit if none stated

**Example plans where this came up:**
- [Plan Name] — [brief context, email date]

---

### [NEXT REQUIREMENT TYPE]
...
```

---

## Example output (reference only)

```
## American Trust — Extra Requirements Catalog
Generated: June 19, 2026

---

### EIN_VERIFICATION

**Trigger:** American Trust couldn't verify the plan sponsor's EIN through LexisNexis
**Who to ask:** Plan sponsor
**AT contact:** Amy Day (follows up weekly until resolved)

**What they need:**
- A government-issued document that confirms the sponsor's EIN

**Acceptable forms:**
- IRS EIN assignment letter
- Prior Form 5500 filing
- Any government document that lists their EIN

**NOT acceptable:** A document where the client self-reports their EIN

**Example plans where this came up:**
- The Social Shepherd Inc. 401(k) Plan — May 27, 2026
- FXC Intelligence LLC 401(k) Plan — May 15, 2026

---

### PRIOR_ENTITY / RELATED_COMPANIES

**Trigger:** Plan wants to count service from a previous company toward the new plan
**Who to ask:** Plan sponsor
**AT contact:** Amy Day / Document Team

**What they need:**
- Name of the prior entity whose service will be counted
- Relationship between all related entities (org chart or written explanation)
- Ownership information for each entity
- Whether any other entities have current employees

**Example plans where this came up:**
- FXC Intelligence LLC 401(k) Plan — May 19, 2026
  (DC Sec of State showed 3 entities under same owner: FXC Development LLC, FXC Group Inc., FXC Intelligence LLC)

---

### BUSINESS_ACQUISITION

**Trigger:** AT compliance/document team flags that plan sponsor acquired an existing business, or that prior plans exist under the same EIN
**Who to ask:** Plan sponsor
**AT contact:** Amy Day / Compliance & Document Team

**What they need:**
- Was it an Asset Purchase or Stock Purchase?
- Copy of the Purchase Agreement
- What happened to the prior plans — were they terminated and assets fully distributed? When?
- If plans terminated less than 12 months ago: successor plan rules may apply

**Example plans where this came up:**
- Nob Hill Catering, LLC — April 29, 2026
  (Prior plans: Nob Hill Catering Inc. 401(k) + Cash Balance Plan; 2023–2024 5500 filings found under same EIN)
```

---

## Prerequisites

- **Gmail MCP must be connected** in Claude Code (Settings → Integrations → Gmail)
- If not connected, Claude will prompt you to authenticate before searching
- Each person using this skill authenticates their own Gmail — no shared credentials needed

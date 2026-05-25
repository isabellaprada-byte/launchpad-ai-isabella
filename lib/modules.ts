export type ModuleStatus = "not_started" | "in_progress" | "complete";

export interface OnboardingModule {
  id: string;
  name: string;
  description: string;
  href: string;
}

export const ONBOARDING_MODULES: OnboardingModule[] = [
  {
    id: "onboarding_home",
    name: "Onboarding Home",
    description: "Overall onboarding progress",
    href: "/",
  },
  {
    id: "plan_details",
    name: "Plan Details",
    description: "Upload plan PDF and review extracted fields",
    href: "/plan",
  },
  {
    id: "participants",
    name: "Participant Data",
    description: "Upload and normalize participant census",
    href: "/participants",
  },
  {
    id: "payroll_mapping",
    name: "Payroll Mapping",
    description: "Map payroll columns to system fields",
    href: "/payroll/mapping",
  },
  {
    id: "payroll_runs",
    name: "Payroll Runs",
    description: "Upload and reconcile payroll runs 2–5",
    href: "/payroll",
  },
  {
    id: "reconciliation_issues",
    name: "Reconciliation Issues",
    description: "Review detected issues and approve fixes",
    href: "/issues",
  },
  {
    id: "audit_trail",
    name: "Change Logs",
    description: "Audit trail of every user and agent action",
    href: "/audit",
  },
  {
    id: "ai_assistant",
    name: "AI Assistant",
    description: "Ask questions about onboarding progress",
    href: "/assistant",
  },
];

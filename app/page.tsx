import { DashboardShell } from "@/components/dashboard-shell";
import { OnboardingStatusGrid } from "@/components/onboarding-status-grid";

export default function Home() {
  return (
    <DashboardShell
      title="Onboarding Home"
      description="401(k) onboarding status for Acme Robotics"
    >
      <OnboardingStatusGrid />
    </DashboardShell>
  );
}

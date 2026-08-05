"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { ParticipantUpload } from "@/components/participant-upload";
import { ParticipantTable } from "@/components/participant-table";

export type Participant = {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  hire_date: string | null;
  termination_date: string | null;
  status: string;
  annual_salary: number | null;
  deferral_rate_pretax: number | null;
  deferral_rate_roth: number | null;
};

export default function ParticipantsPage() {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/participants/get")
      .then((r) => r.json())
      .then((json) => { if (json.data?.length) setParticipants(json.data); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell
      title="Participant Data"
      description="Upload and normalize the participant census"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : participants ? (
        <ParticipantTable participants={participants} />
      ) : (
        <ParticipantUpload onImported={setParticipants} />
      )}
    </DashboardShell>
  );
}

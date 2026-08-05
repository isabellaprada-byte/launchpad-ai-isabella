"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ONBOARDING_MODULES, type ModuleStatus } from "@/lib/modules";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type StatusMap = Record<string, ModuleStatus>;

export function OnboardingStatusGrid() {
  const [status, setStatus] = useState<StatusMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setStatus(json.data);
        }
      })
      .catch(() => setError("Failed to load onboarding status"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading onboarding status…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load status: {error}
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {ONBOARDING_MODULES.map((module) => {
        const moduleStatus = status?.[module.id] ?? "not_started";
        const actionLabel =
          moduleStatus === "complete"
            ? "View"
            : moduleStatus === "in_progress"
              ? "Continue"
              : "Start";

        return (
          <Card key={module.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{module.name}</CardTitle>
                <StatusBadge status={moduleStatus} />
              </div>
              <CardDescription>{module.description}</CardDescription>
            </CardHeader>
            <CardContent />
            <CardFooter>
              <Link
                href={module.href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {actionLabel}
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

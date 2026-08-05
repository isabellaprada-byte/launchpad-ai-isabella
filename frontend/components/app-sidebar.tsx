"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ONBOARDING_MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border px-4 py-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          LaunchPad AI
        </p>
        <p className="text-sm font-semibold text-foreground">Acme Robotics</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {ONBOARDING_MODULES.map((module) => {
          const isActive =
            module.href === "/"
              ? pathname === "/"
              : pathname === module.href ||
                pathname.startsWith(`${module.href}/`);

          return (
            <Link
              key={module.id}
              href={module.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {module.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

import { AppSidebar } from "@/components/app-sidebar";

export function DashboardShell({
  children,
  title,
  description,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex flex-1 flex-col">
        <header className="border-b border-border px-8 py-6">
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </header>
        <div className="flex-1 px-8 py-6">{children}</div>
      </main>
    </div>
  );
}

import { useState } from "react";
import {
  Compass,
  LayoutDashboard,
  MessageSquare,
  Radar,
  Settings,
  Users,
} from "lucide-react";
import { APP_NAME } from "@tourest/shared";
import { cn } from "@/lib/utils";
import { HealthBadge } from "@/features/health/HealthBadge";
import { Dashboard } from "@/pages/Dashboard";
import { Placeholder } from "@/pages/Placeholder";

type ViewId = "dashboard" | "sources" | "leads" | "outreach" | "settings";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sources", label: "Sources", icon: Radar },
  { id: "leads", label: "Leads", icon: Users },
  { id: "outreach", label: "Outreach", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: Settings },
];

function CurrentView({ view }: { view: ViewId }) {
  switch (view) {
    case "dashboard":
      return <Dashboard />;
    case "sources":
      return (
        <Placeholder
          title="Sources"
          description="Register public sources and authorized inboxes to collect from."
        />
      );
    case "leads":
      return (
        <Placeholder
          title="Leads"
          description="Review leads promoted from source items and their qualification."
        />
      );
    case "outreach":
      return (
        <Placeholder
          title="Outreach"
          description="Review and approve personalized message drafts before sending."
        />
      );
    case "settings":
      return (
        <Placeholder
          title="Settings"
          description="Configure the local Ollama model, retention policy, and schedules."
        />
      );
    default:
      return null;
  }
}

export default function App() {
  const [view, setView] = useState<ViewId>("dashboard");

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Compass className="h-6 w-6 text-primary" />
          <span className="font-semibold leading-tight">{APP_NAME}</span>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                view === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Compass className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">{APP_NAME}</span>
          </div>
          <div className="ml-auto">
            <HealthBadge />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <CurrentView view={view} />
        </main>
      </div>
    </div>
  );
}

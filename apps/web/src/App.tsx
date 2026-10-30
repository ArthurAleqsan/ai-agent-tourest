import { useState } from "react";
import {
  Compass,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageSquare,
  Radar,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { APP_NAME } from "@tourest/shared";
import { cn } from "@/lib/utils";
import { HealthBadge } from "@/features/health/HealthBadge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/QueryState";
import { useAuth } from "@/lib/auth";
import { OverviewPage } from "@/pages/OverviewPage";
import { SourcesPage } from "@/pages/SourcesPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { LeadsPage } from "@/pages/LeadsPage";
import { RecommendationsPage } from "@/pages/RecommendationsPage";
import { DraftsPage } from "@/pages/DraftsPage";
import { SeoPage } from "@/pages/SeoPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/LoginPage";

type ViewId =
  | "overview"
  | "sources"
  | "requests"
  | "leads"
  | "recommendations"
  | "drafts"
  | "seo"
  | "activity"
  | "settings";

const NAV: { id: ViewId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "sources", label: "Sources", icon: Radar },
  { id: "requests", label: "Discovered Requests", icon: Search },
  { id: "leads", label: "Qualified Leads", icon: Users },
  { id: "recommendations", label: "AI Recommendations", icon: Sparkles },
  { id: "drafts", label: "Message Drafts", icon: MessageSquare },
  { id: "seo", label: "SEO Opportunities", icon: LineChart },
  { id: "activity", label: "Activity History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

function CurrentView({ view }: { view: ViewId }) {
  switch (view) {
    case "overview":
      return <OverviewPage />;
    case "sources":
      return <SourcesPage />;
    case "requests":
      return <RequestsPage />;
    case "leads":
      return <LeadsPage />;
    case "recommendations":
      return <RecommendationsPage />;
    case "drafts":
      return <DraftsPage />;
    case "seo":
      return <SeoPage />;
    case "activity":
      return <ActivityPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return null;
  }
}

export default function App() {
  const { loading, authenticated, enabled, logout } = useAuth();
  const [view, setView] = useState<ViewId>("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Checking session…" />
      </div>
    );
  }

  if (enabled && !authenticated) {
    return <LoginPage />;
  }

  const navButtons = (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            setView(item.id);
            setMenuOpen(false);
          }}
          aria-current={view === item.id ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
            view === item.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden />
          {item.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <aside className="hidden w-64 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Compass className="h-6 w-6 text-primary" aria-hidden />
          <span className="font-semibold leading-tight">{APP_NAME}</span>
        </div>
        {navButtons}
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative z-50 flex h-full w-64 flex-col bg-card p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">{APP_NAME}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close navigation"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {navButtons}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 md:hidden">
              <Compass className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-semibold">{APP_NAME}</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <HealthBadge />
            {enabled ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void logout()}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </Button>
            ) : null}
          </div>
        </header>
        <main id="main-content" className="flex-1 overflow-auto p-4 md:p-6">
          <CurrentView view={view} />
        </main>
      </div>
    </div>
  );
}

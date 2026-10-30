import { Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHealth } from "./useHealth";

/** Small live indicator of backend/database health. */
export function HealthBadge() {
  const { data, isLoading, isError } = useHealth();

  if (isLoading) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Activity className="h-3 w-3 animate-pulse" /> checking…
      </Badge>
    );
  }

  if (isError || !data) {
    return (
      <Badge variant="destructive" className="gap-1">
        <Activity className="h-3 w-3" /> API offline
      </Badge>
    );
  }

  const variant = data.status === "ok" ? "success" : "warning";
  return (
    <Badge variant={variant} className="gap-1">
      <Activity className="h-3 w-3" /> API {data.status} · db {data.checks.database}
    </Badge>
  );
}

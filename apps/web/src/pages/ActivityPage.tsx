import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { fetchActivity } from "@/lib/api";
import { formatWhen } from "@/lib/format";

export function ActivityPage() {
  const activity = useQuery({ queryKey: ["activity"], queryFn: fetchActivity });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity history"
        description="Audit trail of promotions, qualifications, drafts, job reminders, and privacy actions."
      />

      {activity.isLoading ? <LoadingState /> : null}
      {activity.isError ? (
        <ErrorState
          message="Could not load activity."
          onRetry={() => void activity.refetch()}
        />
      ) : null}
      {activity.data && activity.data.length === 0 ? (
        <EmptyState>No activity recorded yet.</EmptyState>
      ) : null}

      <ol className="space-y-2">
        {activity.data?.map((entry) => (
          <li key={entry.id} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <strong>{entry.action}</strong>{" "}
                <span className="text-muted-foreground">
                  {entry.entityType}
                  {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ""}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {entry.actor} · {formatWhen(entry.createdAt)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

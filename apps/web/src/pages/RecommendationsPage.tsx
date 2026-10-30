import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { createDraft, fetchRecommendations } from "@/lib/api";
import { formatLabel } from "@/lib/format";

export function RecommendationsPage() {
  const qc = useQueryClient();
  const recs = useQuery({
    queryKey: ["recommendations"],
    queryFn: fetchRecommendations,
  });
  const draft = useMutation({
    mutationFn: (sourceItemId: string) => createDraft(sourceItemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["drafts"] });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI recommendations"
        description="Verified Tourest tours ranked for qualified requests. Prices and booking URLs appear only when they exist in the catalog."
      />

      {recs.isLoading ? <LoadingState /> : null}
      {recs.isError ? (
        <ErrorState
          message="Could not load recommendations."
          onRetry={() => void recs.refetch()}
        />
      ) : null}
      {recs.data && recs.data.length === 0 ? (
        <EmptyState>
          No matches yet. Qualify a request and run the tour-matching job, or
          import a catalog from Settings.
        </EmptyState>
      ) : null}

      <ul className="space-y-3">
        {recs.data?.map((row) => (
          <li key={row.match.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {row.tourTitle ?? "Unknown tour"} · {row.tourDestination}
                </p>
                <p className="text-sm text-muted-foreground">
                  score {(row.match.score * 100).toFixed(0)} · matched on{" "}
                  {(row.match.matchedOn ?? []).map(formatLabel).join(", ") || "—"}
                </p>
                <p className="mt-1 text-sm">{row.match.rationale}</p>
                {row.tourUrl ? (
                  <a
                    className="text-sm text-primary underline"
                    href={row.tourUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Booking page
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No verified booking URL
                  </p>
                )}
              </div>
              {row.match.sourceItemId ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => draft.mutate(row.match.sourceItemId as string)}
                >
                  Draft reply
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

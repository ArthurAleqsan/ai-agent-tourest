import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { IntentBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createSourceItem,
  deleteSourceItem,
  fetchSourceItems,
  promoteLead,
  qualifySourceItem,
} from "@/lib/api";
import { formatWhen } from "@/lib/format";

export function RequestsPage() {
  const qc = useQueryClient();
  const items = useQuery({ queryKey: ["source-items"], queryFn: fetchSourceItems });
  const [paste, setPaste] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["source-items"] });
    void qc.invalidateQueries({ queryKey: ["analytics"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const create = useMutation({
    mutationFn: () => createSourceItem(paste),
    onSuccess: () => {
      setPaste("");
      invalidate();
    },
  });
  const qualify = useMutation({
    mutationFn: (id: string) => qualifySourceItem(id),
    onSuccess: invalidate,
  });
  const promote = useMutation({
    mutationFn: (sourceItemId: string) => promoteLead({ sourceItemId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteSourceItem(id),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discovered requests"
        description="Public content and authorized messages. A request is not a contactable lead until you promote it."
      />

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label htmlFor="paste-request" className="text-sm font-medium">
          Paste a public request
        </label>
        <Textarea
          id="paste-request"
          rows={4}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Looking for a diving trip in Hurghada next week…"
        />
        <Button type="submit" disabled={!paste.trim() || create.isPending}>
          Save request
        </Button>
      </form>

      {items.isLoading ? <LoadingState /> : null}
      {items.isError ? (
        <ErrorState message="Could not load requests." onRetry={() => void items.refetch()} />
      ) : null}
      {items.data && items.data.length === 0 ? (
        <EmptyState>No source items yet. Ingest a source or paste a request.</EmptyState>
      ) : null}

      {items.data && items.data.length > 0 ? (
        <ul className="space-y-3">
          {items.data.map(({ item, sourceName, qualification }) => (
            <li key={item.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {sourceName ?? "Unknown source"} · {formatWhen(item.collectedAt)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{item.rawContent}</p>
                  {item.url ? (
                    <a
                      className="text-sm text-primary underline"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Source link
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {qualification ? (
                    <>
                      <IntentBadge value={qualification.intentLevel} />
                      <span className="text-xs text-muted-foreground">
                        score {qualification.intentScore}
                      </span>
                    </>
                  ) : (
                    <StatusBadge value="unqualified" />
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => qualify.mutate(item.id)}
                >
                  {qualification ? "Re-qualify" : "Qualify"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => promote.mutate(item.id)}
                >
                  Promote to lead
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm("Delete this source item and related leads?")) {
                      remove.mutate(item.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

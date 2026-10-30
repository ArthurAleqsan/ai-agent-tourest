import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approveDraft,
  copyDraft,
  editDraft,
  fetchDrafts,
  rejectDraft,
} from "@/lib/api";
import { formatWhen } from "@/lib/format";

export function DraftsPage() {
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: ["drafts"], queryFn: fetchDrafts });
  const [editing, setEditing] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["drafts"] });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      editDraft(id, { body }),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });
  const approve = useMutation({
    mutationFn: (id: string) => approveDraft(id, "dashboard-operator"),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectDraft(id, "rejected from dashboard"),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message drafts"
        description="Every draft stays pending until you approve it. Approval copies nothing to Telegram, email, or Facebook — use Copy to send manually."
      />

      {drafts.isLoading ? <LoadingState /> : null}
      {drafts.isError ? (
        <ErrorState message="Could not load drafts." onRetry={() => void drafts.refetch()} />
      ) : null}
      {drafts.data && drafts.data.length === 0 ? (
        <EmptyState>No drafts yet. Generate one from a lead or recommendation.</EmptyState>
      ) : null}

      <ul className="space-y-4">
        {drafts.data?.map((d) => (
          <li key={d.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{d.subject ?? "(no subject)"}</p>
                <p className="text-xs text-muted-foreground">
                  {d.language} · {formatWhen(d.createdAt)}
                </p>
              </div>
              <StatusBadge value={d.approvalStatus} />
            </div>

            {editing === d.id ? (
              <div className="space-y-2">
                <Textarea
                  aria-label="Edit draft body"
                  rows={10}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => save.mutate({ id: d.id, body })}
                  >
                    Save (returns to pending)
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {d.body}
              </pre>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(d.id);
                  setBody(d.body);
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => approve.mutate(d.id)}
                disabled={d.approvalStatus === "approved"}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => reject.mutate(d.id)}
              >
                Reject
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const copy = await copyDraft(d.id);
                  await navigator.clipboard.writeText(
                    [copy.subject, copy.body].filter(Boolean).join("\n\n"),
                  );
                  setCopied(d.id);
                }}
                disabled={d.approvalStatus !== "approved"}
              >
                {copied === d.id ? "Copied" : "Copy approved text"}
              </Button>
            </div>
            {d.approvalStatus !== "approved" ? (
              <p className="text-xs text-muted-foreground">
                Copy is available only after explicit approval.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

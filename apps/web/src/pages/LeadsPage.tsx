import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LEAD_PIPELINE_STATUSES,
  allowedPipelineTransitions,
} from "@tourest/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { IntentBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createDraft,
  deleteLead,
  fetchLeads,
  fetchSources,
  overrideLead,
  setLeadNotes,
  setLeadStatus,
} from "@/lib/api";
import type { EnrichedLead } from "@/lib/types";
import { formatLabel, formatWhen } from "@/lib/format";

export function LeadsPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [destination, setDestination] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sortBy, setSortBy] = useState<"intent" | "created">("intent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sources = useQuery({ queryKey: ["sources"], queryFn: fetchSources });
  const leads = useQuery({
    queryKey: ["leads", query, status, destination, sourceId, sortBy],
    queryFn: () =>
      fetchLeads({
        query: query || undefined,
        status: status || undefined,
        destination: destination || undefined,
        sourceId: sourceId || undefined,
        sortBy,
        order: "desc",
      }),
  });

  const selected = useMemo(
    () => leads.data?.find((e) => e.lead.id === selectedId) ?? null,
    [leads.data, selectedId],
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["leads"] });
    void qc.invalidateQueries({ queryKey: ["analytics"] });
    void qc.invalidateQueries({ queryKey: ["drafts"] });
  };

  const statusMut = useMutation({
    mutationFn: ({ id, to }: { id: string; to: string }) => setLeadStatus(id, to),
    onSuccess: invalidate,
  });
  const notesMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      setLeadNotes(id, notes),
    onSuccess: invalidate,
  });
  const overrideMut = useMutation({
    mutationFn: ({ id, score, reason }: { id: string; score: number; reason: string }) =>
      overrideLead(id, score, reason),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      setSelectedId(null);
      invalidate();
    },
  });
  const draftMut = useMutation({
    mutationFn: (sourceItemId: string) => createDraft(sourceItemId),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Qualified leads"
        description="Search, filter, and manage pipeline status. Contacting a lead is a human action — approval never auto-posts to any platform."
      />

      <form
        className="grid gap-3 md:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          void leads.refetch();
        }}
      >
        <div className="space-y-1 lg:col-span-2">
          <label htmlFor="lead-q" className="text-sm font-medium">
            Search
          </label>
          <Input
            id="lead-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, notes, destination…"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="lead-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="lead-status"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {LEAD_PIPELINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="lead-dest" className="text-sm font-medium">
            Destination
          </label>
          <Input
            id="lead-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="lead-source" className="text-sm font-medium">
            Source
          </label>
          <select
            id="lead-source"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          >
            <option value="">All</option>
            {sources.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="lead-sort" className="text-sm font-medium">
            Sort
          </label>
          <select
            id="lead-sort"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "intent" | "created")}
          >
            <option value="intent">Intent score</option>
            <option value="created">Created</option>
          </select>
        </div>
      </form>

      {leads.isLoading ? <LoadingState /> : null}
      {leads.isError ? (
        <ErrorState message="Could not load leads." onRetry={() => void leads.refetch()} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="overflow-x-auto rounded-lg border lg:col-span-3">
          {leads.data && leads.data.length === 0 ? (
            <EmptyState>No leads match these filters.</EmptyState>
          ) : (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Leads</caption>
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Intent</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Destination</th>
                </tr>
              </thead>
              <tbody>
                {leads.data?.map((row) => (
                  <tr
                    key={row.lead.id}
                    className={`cursor-pointer border-t hover:bg-accent/40 ${
                      selectedId === row.lead.id ? "bg-accent/60" : ""
                    }`}
                    onClick={() => setSelectedId(row.lead.id)}
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left font-medium"
                        onClick={() => setSelectedId(row.lead.id)}
                      >
                        {row.lead.displayName ?? "Unnamed"}
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {row.sourceName} · {formatWhen(row.lead.createdAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <IntentBadge value={row.intentLevel} />
                      <span className="ml-2 text-xs">{row.intentScore ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge value={row.lead.status} />
                    </td>
                    <td className="px-3 py-2">
                      {row.lead.destinationInterest ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <LeadDetail
          selected={selected}
          onStatus={(to) =>
            selected && statusMut.mutate({ id: selected.lead.id, to })
          }
          onNotes={(notes) =>
            selected && notesMut.mutate({ id: selected.lead.id, notes })
          }
          onOverride={(score, reason) =>
            selected &&
            overrideMut.mutate({ id: selected.lead.id, score, reason })
          }
          onDelete={() =>
            selected &&
            window.confirm("Delete this lead?") &&
            deleteMut.mutate(selected.lead.id)
          }
          onDraft={() =>
            selected && draftMut.mutate(selected.lead.sourceItemId)
          }
        />
      </div>
    </div>
  );
}

function LeadDetail({
  selected,
  onStatus,
  onNotes,
  onOverride,
  onDelete,
  onDraft,
}: {
  selected: EnrichedLead | null;
  onStatus: (to: string) => void;
  onNotes: (notes: string) => void;
  onOverride: (score: number, reason: string) => void;
  onDelete: () => void;
  onDraft: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [score, setScore] = useState("80");
  const [reason, setReason] = useState("");

  if (!selected) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Lead detail</CardTitle>
          <CardDescription>Select a lead to review evidence and update status.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const next = allowedPipelineTransitions(selected.lead.status);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{selected.lead.displayName ?? "Unnamed lead"}</CardTitle>
        <CardDescription>
          {formatLabel(selected.lead.region)} · permission{" "}
          {formatLabel(selected.lead.contactPermissionStatus)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{selected.sourceItemExcerpt}</p>
        {selected.sourceItemUrl ? (
          <a
            className="text-primary underline"
            href={selected.sourceItemUrl}
            target="_blank"
            rel="noreferrer"
          >
            Source link
          </a>
        ) : null}
        {selected.evidence.length > 0 ? (
          <div>
            <p className="font-medium">Evidence</p>
            <ul className="list-disc pl-5">
              {selected.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {next.map((to) => (
            <Button key={to} type="button" size="sm" variant="outline" onClick={() => onStatus(to)}>
              Mark {formatLabel(to)}
            </Button>
          ))}
          <Button type="button" size="sm" onClick={onDraft}>
            Generate draft
          </Button>
        </div>

        <div className="space-y-1">
          <label htmlFor="lead-notes" className="font-medium">
            Notes
          </label>
          <Textarea
            id="lead-notes"
            defaultValue={selected.lead.notes ?? ""}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button type="button" size="sm" onClick={() => onNotes(notes || (selected.lead.notes ?? ""))}>
            Save notes
          </Button>
        </div>

        <div className="space-y-1">
          <p className="font-medium">Manual qualification override</p>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Override score"
              type="number"
              min={0}
              max={100}
              className="w-24"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
            <Input
              aria-label="Override reason"
              placeholder="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onOverride(Number(score), reason)}
            >
              Override
            </Button>
          </div>
        </div>

        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          Delete lead
        </Button>
      </CardContent>
    </Card>
  );
}

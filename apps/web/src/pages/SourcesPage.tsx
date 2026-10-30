import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SOURCE_TYPES } from "@tourest/shared";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { StatusBadge } from "@/components/StatusBadge";
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
  createSource,
  fetchSources,
  ingestSource,
  patchSource,
} from "@/lib/api";
import type { SourceRow } from "@/lib/types";
import { formatLabel } from "@/lib/format";

export function SourcesPage() {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: fetchSources });
  const [name, setName] = useState("");
  const [type, setType] = useState<SourceRow["type"]>("manual_entry");
  const [ingestId, setIngestId] = useState<string | null>(null);
  const [ingestBody, setIngestBody] = useState("");

  const create = useMutation({
    mutationFn: () => createSource({ name, type }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      patchSource(id, { isEnabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["sources"] }),
  });
  const ingest = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      ingestSource(id, payload),
    onSuccess: () => {
      setIngestId(null);
      setIngestBody("");
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sources"
        description="Enable or disable collectors. Telegram polls authorized groups only; Facebook and Yandex are manual CSV/text imports."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a source</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="flex-1 space-y-1">
              <label htmlFor="source-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="source-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="source-type" className="text-sm font-medium">
                Type
              </label>
              <select
                id="source-type"
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as SourceRow["type"])}
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {sources.isLoading ? <LoadingState /> : null}
      {sources.isError ? (
        <ErrorState message="Could not load sources." onRetry={() => void sources.refetch()} />
      ) : null}
      {sources.data && sources.data.length === 0 ? (
        <EmptyState>No sources registered yet.</EmptyState>
      ) : null}

      {sources.data && sources.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registered sources</caption>
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Permission</th>
                <th className="px-3 py-2 font-medium">Enabled</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.data.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{formatLabel(s.type)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={s.accessPermissionStatus} />
                  </td>
                  <td className="px-3 py-2">{s.isEnabled ? "yes" : "no"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          toggle.mutate({ id: s.id, isEnabled: !s.isEnabled })
                        }
                      >
                        {s.isEnabled ? "Disable" : "Enable"}
                      </Button>
                      {(s.type === "facebook" || s.type === "yandex_wordstat") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setIngestId(s.id)}
                        >
                          Import
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {ingestId ? (
        <Card>
          <CardHeader>
            <CardTitle>Manual import</CardTitle>
            <CardDescription>
              Paste public discussion text/CSV (Facebook) or a Wordstat CSV
              (Yandex). Unauthorized scraping is not supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              aria-label="Import payload"
              rows={8}
              value={ingestBody}
              onChange={(e) => setIngestBody(e.target.value)}
              placeholder={'Facebook: {"text":"…"} or {"csv":"url,text\\n…"}  ·  Yandex: {"csv":"Фраза,Показов…"}'}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  let payload: Record<string, unknown> = { csv: ingestBody };
                  try {
                    const parsed = JSON.parse(ingestBody) as unknown;
                    if (parsed && typeof parsed === "object") {
                      payload = parsed as Record<string, unknown>;
                    }
                  } catch {
                    payload = { csv: ingestBody, text: ingestBody };
                  }
                  ingest.mutate({ id: ingestId, payload });
                }}
                disabled={!ingestBody.trim() || ingest.isPending}
              >
                Ingest
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIngestId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

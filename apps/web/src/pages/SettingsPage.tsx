import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  addSuppression,
  fetchJobRuns,
  fetchJobs,
  fetchSettings,
  fetchSuppressions,
  importCatalogCsv,
  pauseJob,
  purgeExpired,
  removeSuppression,
  resumeJob,
  runJob,
} from "@/lib/api";
import { formatWhen } from "@/lib/format";

export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });
  const runs = useQuery({ queryKey: ["job-runs"], queryFn: fetchJobRuns });
  const suppressions = useQuery({
    queryKey: ["suppressions"],
    queryFn: fetchSuppressions,
  });
  const [blockValue, setBlockValue] = useState("");
  const [catalogCsv, setCatalogCsv] = useState("");

  const invalidateJobs = () => {
    void qc.invalidateQueries({ queryKey: ["jobs"] });
    void qc.invalidateQueries({ queryKey: ["job-runs"] });
  };

  const run = useMutation({ mutationFn: runJob, onSuccess: invalidateJobs });
  const pause = useMutation({ mutationFn: pauseJob, onSuccess: invalidateJobs });
  const resume = useMutation({
    mutationFn: resumeJob,
    onSuccess: invalidateJobs,
  });
  const suppress = useMutation({
    mutationFn: () => addSuppression({ value: blockValue, reason: "dashboard" }),
    onSuccess: () => {
      setBlockValue("");
      void qc.invalidateQueries({ queryKey: ["suppressions"] });
    },
  });
  const unsuppress = useMutation({
    mutationFn: removeSuppression,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["suppressions"] }),
  });
  const purge = useMutation({ mutationFn: purgeExpired });
  const catalog = useMutation({
    mutationFn: () => importCatalogCsv(catalogCsv),
    onSuccess: () => setCatalogCsv(""),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Local configuration, job orchestration, contact suppression, and data deletion. Secrets stay in environment variables."
      />

      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState
          message="Could not load settings."
          onRetry={() => void settings.refetch()}
        />
      ) : null}

      {settings.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Environment (non-secret)</CardTitle>
            <CardDescription>
              Passwords and API tokens are never shown here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>Auth: {settings.data.authEnabled ? "enabled" : "disabled (dev)"}</p>
            <p>Environment: {settings.data.nodeEnv}</p>
            <p>Ollama model: {settings.data.ollamaModel}</p>
            <p>Ollama URL: {settings.data.ollamaBaseUrl}</p>
            <p>
              Telegram bot:{" "}
              {settings.data.telegramConfigured ? "configured" : "not set"}
            </p>
            <p>
              Catalog API:{" "}
              {settings.data.catalogConfigured ? "configured" : "CSV/JSON import"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Background jobs</CardTitle>
          <CardDescription>
            Manual run, pause/resume, retries, and failure history. No job sends
            unsolicited messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.isLoading ? <LoadingState /> : null}
          {jobs.data?.map((job) => (
            <div
              key={job.name}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{job.name}</p>
                <p className="text-xs text-muted-foreground">
                  {job.description} · cron {job.schedule} · retries {job.maxRetries}{" "}
                  · concurrency {job.concurrencyLimit}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {job.paused ? (
                  <StatusBadge value="paused" />
                ) : (
                  <StatusBadge value={job.enabled ? "enabled" : "disabled"} />
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => run.mutate(job.name)}
                  disabled={run.isPending}
                >
                  Run now
                </Button>
                {job.paused ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => resume.mutate(job.name)}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => pause.mutate(job.name)}
                  >
                    Pause
                  </Button>
                )}
              </div>
            </div>
          ))}

          <h3 className="pt-2 text-sm font-semibold">Recent runs</h3>
          {runs.data && runs.data.length === 0 ? (
            <EmptyState>No job runs recorded.</EmptyState>
          ) : null}
          <ul className="space-y-1 text-sm">
            {runs.data?.slice(0, 12).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {r.jobName} · {r.status} · {r.itemsProcessed} items
                  {r.error ? ` · ${r.error}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatWhen(r.finishedAt ?? r.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tour catalog import</CardTitle>
          <CardDescription>
            Paste a CSV export. We do not invent Tourest API credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            aria-label="Tour catalog CSV"
            rows={6}
            value={catalogCsv}
            onChange={(e) => setCatalogCsv(e.target.value)}
          />
          <Button
            type="button"
            onClick={() => catalog.mutate()}
            disabled={!catalogCsv.trim() || catalog.isPending}
          >
            Import catalog
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact suppression</CardTitle>
          <CardDescription>
            Suppressed contacts cannot be marked contacted, regardless of lead status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              suppress.mutate();
            }}
          >
            <Input
              aria-label="Contact to suppress"
              placeholder="email, phone, or handle"
              value={blockValue}
              onChange={(e) => setBlockValue(e.target.value)}
              required
            />
            <Button type="submit" disabled={suppress.isPending}>
              Suppress
            </Button>
          </form>
          {suppressions.data && suppressions.data.length === 0 ? (
            <EmptyState>Suppression list is empty.</EmptyState>
          ) : null}
          <ul className="space-y-1 text-sm">
            {suppressions.data?.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2">
                <span>
                  {row.value}
                  {row.reason ? ` · ${row.reason}` : ""}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => unsuppress.mutate(row.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data deletion</CardTitle>
          <CardDescription>
            Purge source items whose retention window has expired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (window.confirm("Purge expired source items now?")) {
                purge.mutate();
              }
            }}
          >
            Purge expired items
          </Button>
          {purge.data ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Deleted {purge.data.deleted} item(s).
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

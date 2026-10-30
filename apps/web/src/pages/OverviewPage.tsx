import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Flame,
  Inbox,
  MessageSquare,
  Reply,
  Ticket,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fetchAnalytics, fetchJobs } from "@/lib/api";
import { formatPercent } from "@/lib/format";

const METRICS = [
  { key: "collectedSourceItems", label: "Collected items", icon: Inbox },
  { key: "qualifiedLeads", label: "Qualified leads", icon: Users },
  { key: "hotLeads", label: "Hot leads", icon: Flame },
  { key: "approvedDrafts", label: "Approved drafts", icon: MessageSquare },
  { key: "contactedLeads", label: "Contacted", icon: CheckCircle2 },
  { key: "replies", label: "Replies", icon: Reply },
  { key: "bookings", label: "Bookings (confirmed)", icon: Ticket },
] as const;

export function OverviewPage() {
  const analytics = useQuery({ queryKey: ["analytics"], queryFn: fetchAnalytics });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Confirmed local counts only. Bookings are leads a human marked converted — nothing is estimated or attributed automatically."
      />

      {analytics.isLoading ? <LoadingState label="Loading analytics…" /> : null}
      {analytics.isError ? (
        <ErrorState
          message="Could not load analytics."
          onRetry={() => void analytics.refetch()}
        />
      ) : null}

      {analytics.data ? (
        <section
          aria-label="Confirmed metrics"
          className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7"
        >
          {METRICS.map((metric) => (
            <Card key={metric.key}>
              <CardHeader className="pb-2">
                <metric.icon className="h-4 w-4 text-primary" aria-hidden />
                <CardTitle className="text-sm font-medium">
                  {metric.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{analytics.data[metric.key]}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Source conversion</CardTitle>
            <CardDescription>
              Converted leads ÷ collected items for that source. Zero when a
              source has no items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!analytics.data?.bySource.length ? (
              <EmptyState>No sources have collected items yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Conversion rates by source
                  </caption>
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="py-2 pr-3 font-medium">Items</th>
                      <th className="py-2 pr-3 font-medium">Leads</th>
                      <th className="py-2 pr-3 font-medium">Converted</th>
                      <th className="py-2 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.data.bySource.map((row) => (
                      <tr key={row.sourceId} className="border-b last:border-0">
                        <td className="py-2 pr-3">{row.sourceName}</td>
                        <td className="py-2 pr-3">{row.collectedItems}</td>
                        <td className="py-2 pr-3">{row.leads}</td>
                        <td className="py-2 pr-3">{row.converted}</td>
                        <td className="py-2">{formatPercent(row.conversionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>
              Pause, resume, and run from Settings. Draft generation never sends
              messages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.isLoading ? <LoadingState /> : null}
            {jobs.data?.map((job) => (
              <div
                key={job.name}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>{job.name}</span>
                <span className="flex items-center gap-2">
                  {job.paused ? (
                    <Badge variant="warning">paused</Badge>
                  ) : job.enabled ? (
                    <Badge variant="success">on</Badge>
                  ) : (
                    <Badge variant="outline">disabled</Badge>
                  )}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

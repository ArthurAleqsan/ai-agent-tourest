import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchSeo } from "@/lib/api";
import { formatLabel } from "@/lib/format";

export function SeoPage() {
  const seo = useQuery({ queryKey: ["seo"], queryFn: fetchSeo });

  return (
    <div className="space-y-6">
      <PageHeader
        title="SEO opportunities"
        description="Aggregate Yandex Wordstat demand — not individual leads. Import a CSV from Sources."
      />

      {seo.isLoading ? <LoadingState /> : null}
      {seo.isError ? (
        <ErrorState message="Could not load SEO opportunities." onRetry={() => void seo.refetch()} />
      ) : null}
      {seo.data && seo.data.length === 0 ? (
        <EmptyState>No keyword demand imported yet.</EmptyState>
      ) : null}

      {seo.data && seo.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">SEO keyword opportunities</caption>
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 font-medium">Keyword</th>
                <th className="px-3 py-2 font-medium">Demand</th>
                <th className="px-3 py-2 font-medium">Region</th>
                <th className="px-3 py-2 font-medium">Activity</th>
                <th className="px-3 py-2 font-medium">Intent</th>
              </tr>
            </thead>
            <tbody>
              {seo.data.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.keyword}</td>
                  <td className="px-3 py-2">{row.demand ?? "—"}</td>
                  <td className="px-3 py-2">{formatLabel(row.region)}</td>
                  <td className="px-3 py-2">{formatLabel(row.activityCategory)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge value={row.commercialIntentLevel} />{" "}
                    <span className="text-xs">{row.commercialIntentScore}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

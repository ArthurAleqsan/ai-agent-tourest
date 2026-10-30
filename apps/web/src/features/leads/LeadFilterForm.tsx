import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LEAD_LIFECYCLE_STATUSES, MARKET_REGIONS } from "@tourest/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Client-side lead filter form demonstrating React Hook Form + Zod.
 * Not yet wired to the backend (no lead data in this step).
 */
const regionValues = ["", ...MARKET_REGIONS] as const;
const statusValues = ["", ...LEAD_LIFECYCLE_STATUSES] as const;

const filterSchema = z.object({
  query: z.string().max(120).optional(),
  region: z.enum(regionValues).optional(),
  status: z.enum(statusValues).optional(),
});

export type LeadFilterValues = z.infer<typeof filterSchema>;

export function LeadFilterForm({
  onApply,
}: {
  onApply?: (values: LeadFilterValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFilterValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: { query: "", region: "", status: "" },
  });

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={handleSubmit((values) => onApply?.(values))}
    >
      <div className="flex-1 space-y-1">
        <label htmlFor="query" className="text-sm font-medium">
          Search
        </label>
        <Input
          id="query"
          placeholder="Keyword, destination…"
          {...register("query")}
        />
        {errors.query && (
          <p className="text-xs text-destructive">{errors.query.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="region" className="text-sm font-medium">
          Region
        </label>
        <select
          id="region"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
          {...register("region")}
        >
          <option value="">All regions</option>
          {MARKET_REGIONS.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-44"
          {...register("status")}
        >
          <option value="">All statuses</option>
          {LEAD_LIFECYCLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit">Apply</Button>
    </form>
  );
}

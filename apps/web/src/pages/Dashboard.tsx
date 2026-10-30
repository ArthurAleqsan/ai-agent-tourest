import { useState } from "react";
import {
  CheckCircle2,
  Compass,
  Inbox,
  MessageSquare,
  Target,
  Users,
} from "lucide-react";
import { LEAD_LIFECYCLE_STATUSES } from "@tourest/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LeadFilterForm,
  type LeadFilterValues,
} from "@/features/leads/LeadFilterForm";

const pipelineStages = [
  { icon: Inbox, label: "Sources", description: "Public & authorized inputs" },
  { icon: Users, label: "Leads", description: "Promoted from source items" },
  { icon: Target, label: "Qualified", description: "Intent assessed by AI" },
  { icon: Compass, label: "Matched", description: "Relevant Tourest tours" },
  { icon: MessageSquare, label: "Drafted", description: "Awaiting approval" },
  { icon: CheckCircle2, label: "Approved", description: "Ready for outreach" },
] as const;

export function Dashboard() {
  const [filters, setFilters] = useState<LeadFilterValues | null>(null);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Discover travel intent, match tours, and prepare outreach for human
          approval — all locally and privately.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {pipelineStages.map((stage) => (
          <Card key={stage.label}>
            <CardHeader className="pb-2">
              <stage.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{stage.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">
                {stage.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Lead pipeline</CardTitle>
          <CardDescription>
            Filtering UI is wired with React Hook Form + Zod. Lead data arrives
            in a later step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LeadFilterForm onApply={setFilters} />
          {filters && (
            <pre className="rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(filters, null, 2)}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            {LEAD_LIFECYCLE_STATUSES.map((status) => (
              <Badge key={status} variant="outline">
                {status}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

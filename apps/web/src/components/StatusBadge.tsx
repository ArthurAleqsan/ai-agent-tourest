import { Badge } from "@/components/ui/badge";
import { formatLabel, intentBadgeVariant, pipelineBadgeVariant } from "@/lib/format";

export function StatusBadge({ value }: { value: string }) {
  return <Badge variant={pipelineBadgeVariant(value)}>{formatLabel(value)}</Badge>;
}

export function IntentBadge({ value }: { value: string | null }) {
  if (!value) return <Badge variant="outline">unscored</Badge>;
  return <Badge variant={intentBadgeVariant(value)}>{value}</Badge>;
}

/** Human-readable label for enum-like snake_case values. */
export function formatLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

/** Format a 0..1 rate as a percentage with one decimal. */
export function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Short locale timestamp; empty/null becomes an em dash. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function intentBadgeVariant(
  level: string | null | undefined,
): "destructive" | "warning" | "secondary" | "outline" {
  switch (level) {
    case "hot":
      return "destructive";
    case "warm":
      return "warning";
    case "cold":
      return "secondary";
    default:
      return "outline";
  }
}

export function pipelineBadgeVariant(
  status: string,
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  switch (status) {
    case "converted":
    case "approved":
      return "success";
    case "hot":
    case "rejected":
      return "destructive";
    case "contacted":
    case "replied":
    case "draft_ready":
      return "warning";
    case "qualified":
      return "default";
    default:
      return "secondary";
  }
}

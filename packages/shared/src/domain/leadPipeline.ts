import type { LeadPipelineStatus } from "../enums";

/**
 * Step 5 sales-pipeline state machine for leads.
 *
 * Encodes allowed transitions between the operator-facing pipeline statuses.
 * Outreach-related transitions (contacted/replied/converted) always require a
 * human action in the UI — nothing here sends messages.
 */
const PIPELINE_TRANSITIONS: Record<
  LeadPipelineStatus,
  readonly LeadPipelineStatus[]
> = {
  discovered: ["qualified", "rejected"],
  qualified: ["draft_ready", "rejected", "discovered"],
  draft_ready: ["approved", "rejected", "qualified"],
  approved: ["contacted", "rejected", "draft_ready"],
  contacted: ["replied", "converted", "rejected"],
  replied: ["converted", "rejected", "contacted"],
  converted: [],
  rejected: ["discovered"],
};

export function allowedPipelineTransitions(
  from: LeadPipelineStatus,
): readonly LeadPipelineStatus[] {
  return PIPELINE_TRANSITIONS[from];
}

export function canTransitionPipeline(
  from: LeadPipelineStatus,
  to: LeadPipelineStatus,
): boolean {
  if (from === to) return true; // idempotent no-op allowed
  return PIPELINE_TRANSITIONS[from].includes(to);
}

export class InvalidPipelineTransitionError extends Error {
  constructor(
    public readonly from: LeadPipelineStatus,
    public readonly to: LeadPipelineStatus,
  ) {
    super(`Invalid lead pipeline transition: "${from}" -> "${to}"`);
    this.name = "InvalidPipelineTransitionError";
  }
}

export function transitionPipeline(
  from: LeadPipelineStatus,
  to: LeadPipelineStatus,
): LeadPipelineStatus {
  if (!canTransitionPipeline(from, to)) {
    throw new InvalidPipelineTransitionError(from, to);
  }
  return to;
}

export function isTerminalPipelineStatus(status: LeadPipelineStatus): boolean {
  return PIPELINE_TRANSITIONS[status].length === 0;
}

/** Statuses that represent an outreach/no-reply follow-up candidate. */
export const FOLLOW_UP_CANDIDATE_STATUSES: readonly LeadPipelineStatus[] = [
  "approved",
  "contacted",
];

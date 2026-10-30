import type { HumanApprovalStatus, LeadLifecycleStatus } from "../enums";

/**
 * Lead lifecycle state machine.
 *
 * Encodes the allowed transitions between {@link LeadLifecycleStatus} values.
 * A SourceItem is promoted into a Lead at `new`; everything after that is a
 * controlled transition so we never, e.g., mark a lead `contacted` before it
 * has been `approved` by a human.
 */
const LEAD_TRANSITIONS: Record<LeadLifecycleStatus, readonly LeadLifecycleStatus[]> = {
  new: ["qualified", "rejected", "archived"],
  qualified: ["matched", "rejected", "archived"],
  matched: ["drafted", "rejected", "archived"],
  drafted: ["approved", "rejected", "archived"],
  approved: ["contacted", "rejected", "archived"],
  contacted: ["converted", "rejected", "archived"],
  converted: ["archived"],
  rejected: ["archived", "new"], // allow re-opening a rejected lead
  archived: [], // terminal
};

export function allowedLeadTransitions(
  from: LeadLifecycleStatus,
): readonly LeadLifecycleStatus[] {
  return LEAD_TRANSITIONS[from];
}

export function canTransitionLead(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus,
): boolean {
  if (from === to) return false;
  return LEAD_TRANSITIONS[from].includes(to);
}

export class InvalidLeadTransitionError extends Error {
  constructor(
    public readonly from: LeadLifecycleStatus,
    public readonly to: LeadLifecycleStatus,
  ) {
    super(`Invalid lead transition: "${from}" -> "${to}"`);
    this.name = "InvalidLeadTransitionError";
  }
}

/**
 * Validate a lead transition, throwing {@link InvalidLeadTransitionError} when
 * it is not allowed. Returns the target status on success.
 */
export function transitionLead(
  from: LeadLifecycleStatus,
  to: LeadLifecycleStatus,
): LeadLifecycleStatus {
  if (!canTransitionLead(from, to)) {
    throw new InvalidLeadTransitionError(from, to);
  }
  return to;
}

export function isTerminalLeadStatus(status: LeadLifecycleStatus): boolean {
  return LEAD_TRANSITIONS[status].length === 0;
}

/**
 * Human approval state machine (shared by Leads and MessageDrafts).
 */
const APPROVAL_TRANSITIONS: Record<HumanApprovalStatus, readonly HumanApprovalStatus[]> = {
  pending: ["approved", "rejected", "needs_changes"],
  needs_changes: ["pending", "approved", "rejected"],
  approved: ["needs_changes", "rejected"], // allow revocation
  rejected: ["pending"], // allow reconsideration
};

export function canTransitionApproval(
  from: HumanApprovalStatus,
  to: HumanApprovalStatus,
): boolean {
  if (from === to) return false;
  return APPROVAL_TRANSITIONS[from].includes(to);
}

export class InvalidApprovalTransitionError extends Error {
  constructor(
    public readonly from: HumanApprovalStatus,
    public readonly to: HumanApprovalStatus,
  ) {
    super(`Invalid approval transition: "${from}" -> "${to}"`);
    this.name = "InvalidApprovalTransitionError";
  }
}

export function transitionApproval(
  from: HumanApprovalStatus,
  to: HumanApprovalStatus,
): HumanApprovalStatus {
  if (!canTransitionApproval(from, to)) {
    throw new InvalidApprovalTransitionError(from, to);
  }
  return to;
}

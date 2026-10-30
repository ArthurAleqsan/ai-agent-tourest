import { describe, expect, it } from "vitest";
import {
  InvalidApprovalTransitionError,
  InvalidLeadTransitionError,
  allowedLeadTransitions,
  canTransitionApproval,
  canTransitionLead,
  isTerminalLeadStatus,
  transitionApproval,
  transitionLead,
} from "../src/domain/leadLifecycle";

describe("lead lifecycle transitions", () => {
  it("allows the happy path new -> ... -> converted", () => {
    expect(canTransitionLead("new", "qualified")).toBe(true);
    expect(canTransitionLead("qualified", "matched")).toBe(true);
    expect(canTransitionLead("matched", "drafted")).toBe(true);
    expect(canTransitionLead("drafted", "approved")).toBe(true);
    expect(canTransitionLead("approved", "contacted")).toBe(true);
    expect(canTransitionLead("contacted", "converted")).toBe(true);
  });

  it("forbids skipping approval before contact", () => {
    expect(canTransitionLead("drafted", "contacted")).toBe(false);
    expect(canTransitionLead("new", "contacted")).toBe(false);
  });

  it("forbids no-op transitions to the same status", () => {
    expect(canTransitionLead("new", "new")).toBe(false);
  });

  it("treats archived as terminal", () => {
    expect(isTerminalLeadStatus("archived")).toBe(true);
    expect(allowedLeadTransitions("archived")).toHaveLength(0);
  });

  it("transitionLead returns the target on success", () => {
    expect(transitionLead("new", "qualified")).toBe("qualified");
  });

  it("transitionLead throws on an invalid transition", () => {
    expect(() => transitionLead("new", "converted")).toThrow(
      InvalidLeadTransitionError,
    );
  });

  it("allows re-opening a rejected lead", () => {
    expect(canTransitionLead("rejected", "new")).toBe(true);
  });
});

describe("human approval transitions", () => {
  it("allows pending -> approved/rejected/needs_changes", () => {
    expect(canTransitionApproval("pending", "approved")).toBe(true);
    expect(canTransitionApproval("pending", "rejected")).toBe(true);
    expect(canTransitionApproval("pending", "needs_changes")).toBe(true);
  });

  it("allows revoking an approval", () => {
    expect(transitionApproval("approved", "rejected")).toBe("rejected");
  });

  it("throws on invalid approval transition", () => {
    expect(() => transitionApproval("rejected", "approved")).toThrow(
      InvalidApprovalTransitionError,
    );
  });
});

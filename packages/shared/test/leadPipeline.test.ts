import { describe, expect, it } from "vitest";
import {
  InvalidPipelineTransitionError,
  allowedPipelineTransitions,
  canTransitionPipeline,
  isTerminalPipelineStatus,
  transitionPipeline,
} from "../src/domain/leadPipeline";

describe("lead pipeline transitions", () => {
  it("allows the operator happy path through contacted -> converted", () => {
    expect(canTransitionPipeline("discovered", "qualified")).toBe(true);
    expect(canTransitionPipeline("qualified", "draft_ready")).toBe(true);
    expect(canTransitionPipeline("draft_ready", "approved")).toBe(true);
    expect(canTransitionPipeline("approved", "contacted")).toBe(true);
    expect(canTransitionPipeline("contacted", "replied")).toBe(true);
    expect(canTransitionPipeline("replied", "converted")).toBe(true);
  });

  it("forbids skipping human approval before contact", () => {
    expect(canTransitionPipeline("discovered", "contacted")).toBe(false);
    expect(canTransitionPipeline("qualified", "contacted")).toBe(false);
    expect(canTransitionPipeline("draft_ready", "contacted")).toBe(false);
  });

  it("treats converted as terminal", () => {
    expect(isTerminalPipelineStatus("converted")).toBe(true);
    expect(allowedPipelineTransitions("converted")).toHaveLength(0);
  });

  it("allows re-opening a rejected lead", () => {
    expect(transitionPipeline("rejected", "discovered")).toBe("discovered");
  });

  it("throws on an invalid transition", () => {
    expect(() => transitionPipeline("discovered", "converted")).toThrow(
      InvalidPipelineTransitionError,
    );
  });
});

import { describe, expect, it } from "vitest";
import { formatLabel, formatPercent, formatWhen, intentBadgeVariant } from "./format";

describe("format helpers", () => {
  it("turns snake_case into a readable label", () => {
    expect(formatLabel("draft_ready")).toBe("draft ready");
    expect(formatLabel(null)).toBe("—");
  });

  it("formats confirmed conversion rates without inventing precision", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.125)).toBe("12.5%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("returns an em dash for missing timestamps", () => {
    expect(formatWhen(null)).toBe("—");
    expect(formatWhen("not-a-date")).toBe("—");
  });

  it("maps hot intent to a prominent badge variant", () => {
    expect(intentBadgeVariant("hot")).toBe("destructive");
    expect(intentBadgeVariant("warm")).toBe("warning");
  });
});

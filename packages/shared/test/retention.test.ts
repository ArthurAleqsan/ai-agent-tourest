import { describe, expect, it } from "vitest";
import {
  computeRetentionExpiry,
  isRetentionExpired,
} from "../src/domain/retention";

describe("computeRetentionExpiry", () => {
  it("adds the given number of days", () => {
    const expiry = computeRetentionExpiry("2026-01-01T00:00:00.000Z", 30);
    expect(expiry).toBe("2026-01-31T00:00:00.000Z");
  });

  it("accepts a Date instance", () => {
    const expiry = computeRetentionExpiry(
      new Date("2026-01-01T00:00:00.000Z"),
      1,
    );
    expect(expiry).toBe("2026-01-02T00:00:00.000Z");
  });

  it("rejects non-positive retention", () => {
    expect(() => computeRetentionExpiry("2026-01-01T00:00:00.000Z", 0)).toThrow(
      RangeError,
    );
  });

  it("rejects an invalid timestamp", () => {
    expect(() => computeRetentionExpiry("not-a-date", 10)).toThrow(TypeError);
  });
});

describe("isRetentionExpired", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("returns false for null (never expires)", () => {
    expect(isRetentionExpired(null, now)).toBe(false);
  });

  it("returns true when expiry is in the past", () => {
    expect(isRetentionExpired("2026-05-31T23:59:59.000Z", now)).toBe(true);
  });

  it("returns false when expiry is in the future", () => {
    expect(isRetentionExpired("2026-06-02T00:00:00.000Z", now)).toBe(false);
  });
});

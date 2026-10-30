import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords } from "../src/core/csv";
import { RateLimiter } from "../src/core/rateLimiter";

describe("parseCsv", () => {
  it("parses quoted fields with embedded commas and newlines", () => {
    const input = 'a,b,c\r\n"x,1","y\n2","z""q"\n';
    const rows = parseCsv(input);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x,1", "y\n2", 'z"q'],
    ]);
  });

  it("maps records by normalized header", () => {
    const records = parseCsvRecords("First Name,Age\nAda,36\n");
    expect(records).toEqual([{ first_name: "Ada", age: "36" }]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});

describe("RateLimiter", () => {
  it("allows up to capacity then refuses until refill", () => {
    let t = 0;
    const rl = new RateLimiter({ capacity: 2, refillPerSecond: 1, now: () => t });
    expect(rl.tryRemoveTokens(1)).toBe(true);
    expect(rl.tryRemoveTokens(1)).toBe(true);
    expect(rl.tryRemoveTokens(1)).toBe(false);

    // Advance one second -> 1 token refilled.
    t = 1000;
    expect(rl.tryRemoveTokens(1)).toBe(true);
    expect(rl.tryRemoveTokens(1)).toBe(false);
  });

  it("never exceeds capacity when refilling", () => {
    let t = 0;
    const rl = new RateLimiter({ capacity: 3, refillPerSecond: 10, now: () => t });
    t = 10_000;
    expect(rl.availableTokens()).toBe(3);
  });
});

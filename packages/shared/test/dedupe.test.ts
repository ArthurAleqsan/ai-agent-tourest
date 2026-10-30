import { describe, expect, it } from "vitest";
import {
  computeContentHash,
  computeLeadDedupeKey,
  computeSourceItemDedupeKey,
  normalizeText,
  stableHash,
} from "../src/domain/dedupe";

describe("normalizeText", () => {
  it("collapses whitespace, trims and lowercases", () => {
    expect(normalizeText("  Hello   WORLD\n\t")).toBe("hello world");
  });

  it("is idempotent", () => {
    const once = normalizeText("Sharm  El   Sheikh");
    expect(normalizeText(once)).toBe(once);
  });
});

describe("stableHash", () => {
  it("is deterministic for the same input", () => {
    expect(stableHash("tourest")).toBe(stableHash("tourest"));
  });

  it("produces a 16-char hex string", () => {
    expect(stableHash("anything")).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs for different inputs", () => {
    expect(stableHash("cairo")).not.toBe(stableHash("hurghada"));
  });

  it("handles empty input", () => {
    expect(stableHash("")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("computeContentHash", () => {
  it("ignores case and surrounding whitespace via normalization", () => {
    expect(computeContentHash("  Diving in Hurghada ")).toBe(
      computeContentHash("diving in hurghada"),
    );
  });
});

describe("computeSourceItemDedupeKey", () => {
  it("prefers externalId when present", () => {
    const key = computeSourceItemDedupeKey({
      sourceType: "web_public",
      externalId: "abc-123",
      url: "https://example.com/x",
      rawContent: "whatever",
    });
    expect(key).toBe("web_public:ext:abc-123");
  });

  it("falls back to url when externalId is missing", () => {
    const key = computeSourceItemDedupeKey({
      sourceType: "rss_feed",
      externalId: null,
      url: "https://example.com/post/1",
      rawContent: "whatever",
    });
    expect(key.startsWith("rss_feed:url:")).toBe(true);
  });

  it("falls back to content hash when no id/url", () => {
    const key = computeSourceItemDedupeKey({
      sourceType: "manual_entry",
      rawContent: "Looking for a Red Sea snorkeling trip",
    });
    expect(key.startsWith("manual_entry:content:")).toBe(true);
  });

  it("produces identical keys for equivalent content", () => {
    const a = computeSourceItemDedupeKey({
      sourceType: "manual_entry",
      rawContent: "Trip to CAIRO  ",
    });
    const b = computeSourceItemDedupeKey({
      sourceType: "manual_entry",
      rawContent: "trip to cairo",
    });
    expect(a).toBe(b);
  });
});

describe("computeLeadDedupeKey", () => {
  it("prefers a contact handle", () => {
    expect(
      computeLeadDedupeKey({
        contactHandle: "USER@Example.com",
        sourceItemId: "item-1",
      }),
    ).toBe(
      computeLeadDedupeKey({
        contactHandle: "user@example.com",
        sourceItemId: "item-2",
      }),
    );
  });

  it("falls back to sourceItemId when nothing else is known", () => {
    expect(
      computeLeadDedupeKey({ sourceItemId: "item-xyz" }),
    ).toBe("item:item-xyz");
  });
});

import { describe, expect, it } from "vitest";
import {
  composeSalesDraft,
  resolveDraftLanguage,
  type SalesDraftTour,
} from "../src/domain/salesDraft";

const verifiedTour = (overrides: Partial<SalesDraftTour> = {}): SalesDraftTour => ({
  // Base defaults, then spread overrides so explicit `null` is respected.
  title: "Hurghada Diving Day Trip",
  destination: "Hurghada",
  durationHours: 6,
  durationLabel: null,
  priceFrom: 55,
  currency: "USD",
  url: "https://tourest.online/t/hrg-dive",
  ...overrides,
});

describe("resolveDraftLanguage", () => {
  it("selects Russian only for an explicit ru preference", () => {
    expect(resolveDraftLanguage("ru")).toBe("ru");
    expect(resolveDraftLanguage("RU")).toBe("ru");
    expect(resolveDraftLanguage("ru-RU")).toBe("ru");
    expect(resolveDraftLanguage("en")).toBe("en");
    expect(resolveDraftLanguage("ar")).toBe("en");
    expect(resolveDraftLanguage(null)).toBe("en");
  });
});

describe("composeSalesDraft", () => {
  it("writes a Russian draft with a commercial disclosure", () => {
    const draft = composeSalesDraft({
      language: "ru",
      destination: "Хургада",
      activity: "дайвинг",
      tours: [verifiedTour()],
    });
    expect(draft.language).toBe("ru");
    expect(draft.body).toContain("Здравствуйте");
    expect(draft.body).toContain("Tourest"); // commercial disclosure
    expect(draft.body).toContain("Хургада");
    expect(draft.subject).toContain("Tourest");
  });

  it("writes an English draft by default", () => {
    const draft = composeSalesDraft({
      language: "en",
      destination: "Hurghada",
      activity: "diving",
      tours: [verifiedTour()],
    });
    expect(draft.language).toBe("en");
    expect(draft.body).toContain("Hello");
    expect(draft.body).toContain("I'm with Tourest");
  });

  it("includes verified price and booking link when available", () => {
    const draft = composeSalesDraft({
      language: "en",
      destination: "Hurghada",
      activity: "diving",
      tours: [verifiedTour({ priceFrom: 55, currency: "USD", url: "https://tourest.online/x" })],
    });
    expect(draft.body).toContain("from 55 USD");
    expect(draft.body).toContain("https://tourest.online/x");
  });

  it("never fabricates a price or booking link when they are missing", () => {
    const draft = composeSalesDraft({
      language: "en",
      destination: "Hurghada",
      activity: "snorkeling",
      tours: [
        verifiedTour({
          title: "Giftun Snorkeling",
          priceFrom: null,
          currency: null,
          url: null,
          durationHours: null,
          durationLabel: null,
        }),
      ],
    });
    expect(draft.body).toContain("Giftun Snorkeling");
    expect(draft.body).not.toMatch(/https?:\/\//);
    expect(draft.body).not.toMatch(/USD|EUR|\$|from \d/);
  });

  it("omits a price when only the amount is known but currency is missing", () => {
    const draft = composeSalesDraft({
      language: "en",
      destination: "Hurghada",
      activity: "diving",
      tours: [verifiedTour({ priceFrom: 55, currency: null })],
    });
    expect(draft.body).not.toMatch(/55/);
  });

  it("produces a helpful, non-fabricated fallback when there are no tours", () => {
    const draft = composeSalesDraft({
      language: "en",
      destination: "Hurghada",
      activity: "diving",
      tours: [],
    });
    expect(draft.body).toContain("Tourest");
    expect(draft.body).not.toMatch(/https?:\/\//);
    // No numbered recommendations when nothing matched.
    expect(draft.body).not.toMatch(/^\s*1\./m);
  });
});

import { describe, expect, it } from "vitest";
import {
  matchTours,
  type MatchableTour,
  type TravelRequest,
} from "../src/domain/tourMatching";

function tour(overrides: Partial<MatchableTour>): MatchableTour {
  return {
    id: overrides.id ?? "t-" + Math.random().toString(36).slice(2),
    externalId: overrides.externalId ?? null,
    title: overrides.title ?? "Tour",
    destination: overrides.destination ?? "Hurghada",
    country: overrides.country ?? "Egypt",
    category: overrides.category ?? null,
    description: overrides.description ?? null,
    languages: overrides.languages ?? [],
    durationHours: overrides.durationHours ?? null,
    durationLabel: overrides.durationLabel ?? null,
    priceFrom: overrides.priceFrom ?? null,
    currency: overrides.currency ?? null,
    url: overrides.url ?? null,
    availability: overrides.availability ?? null,
    isActive: overrides.isActive ?? true,
  };
}

const request = (overrides: Partial<TravelRequest>): TravelRequest => ({
  destination: null,
  city: null,
  region: null,
  activityCategory: null,
  travelDates: null,
  travelersCount: null,
  language: null,
  ...overrides,
});

describe("matchTours", () => {
  it("filters by destination and excludes the wrong one", () => {
    const tours = [
      tour({ id: "hrg", title: "Hurghada Diving", destination: "Hurghada", category: "diving" }),
      tour({ id: "dxb", title: "Dubai Desert Safari", destination: "Dubai", country: "UAE", category: "desert_safari" }),
    ];
    const result = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving" }),
      tours,
    );
    expect(result.map((r) => r.tour.id)).toEqual(["hrg"]);
    expect(result[0]!.matchedOn).toContain("destination");
    expect(result[0]!.matchedOn).toContain("activity");
  });

  it("excludes unavailable tours (sold out or inactive)", () => {
    const tours = [
      tour({ id: "ok", destination: "Hurghada", category: "diving", availability: { available: true } }),
      tour({ id: "sold", destination: "Hurghada", category: "diving", availability: { soldOut: true } }),
      tour({ id: "inactive", destination: "Hurghada", category: "diving", isActive: false }),
      tour({ id: "nospots", destination: "Hurghada", category: "diving", availability: { spotsLeft: 0 } }),
    ];
    const result = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving" }),
      tours,
    );
    expect(result.map((r) => r.tour.id)).toEqual(["ok"]);
  });

  it("ranks at most three tours by relevance", () => {
    const tours = [
      tour({ id: "a", destination: "Hurghada", category: "diving", languages: ["ru", "en"], availability: { available: true }, durationHours: 6 }),
      tour({ id: "b", destination: "Hurghada", category: "diving" }),
      tour({ id: "c", destination: "Hurghada", category: "snorkeling" }),
      tour({ id: "d", destination: "Hurghada", category: "boat_trip" }),
    ];
    const result = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving", language: "ru" }),
      tours,
    );
    expect(result.length).toBeLessThanOrEqual(3);
    // "a" has the most matching signals -> ranked first.
    expect(result[0]!.tour.id).toBe("a");
    // Scores are non-increasing.
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
    }
  });

  it("keeps a matching tour even when the price is missing, without inventing one", () => {
    const tours = [
      tour({ id: "free-of-price", destination: "Hurghada", category: "snorkeling", priceFrom: null, currency: null, url: null }),
    ];
    const result = matchTours(
      request({ destination: "Hurghada", activityCategory: "snorkeling" }),
      tours,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.tour.priceFrom).toBeNull();
    // Rationale must not fabricate a price or a currency symbol.
    expect(result[0]!.rationale).not.toMatch(/\$|USD|EUR|price/i);
  });

  it("only claims availability when reliable data confirms it", () => {
    const confirmed = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving" }),
      [tour({ id: "a", destination: "Hurghada", category: "diving", availability: { available: true } })],
    );
    expect(confirmed[0]!.matchedOn).toContain("availability");

    const unknown = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving" }),
      [tour({ id: "b", destination: "Hurghada", category: "diving", availability: null })],
    );
    expect(unknown[0]!.matchedOn).not.toContain("availability");
    expect(unknown[0]!.rationale).not.toMatch(/availab/i);
  });

  it("returns nothing when the request has neither destination nor activity", () => {
    const tours = [tour({ destination: "Hurghada", category: "diving" })];
    expect(matchTours(request({}), tours)).toEqual([]);
  });

  it("rewards tours offered in the requested language", () => {
    const [withLang] = matchTours(
      request({ destination: "Hurghada", activityCategory: "diving", language: "ru" }),
      [tour({ id: "ru", destination: "Hurghada", category: "diving", languages: ["ru", "en"] })],
    );
    expect(withLang!.matchedOn).toContain("language");
  });
});

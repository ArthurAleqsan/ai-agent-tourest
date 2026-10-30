import { describe, expect, it } from "vitest";
import {
  aiExtractionSchema,
  computeIntentScore,
  deriveIntentLevel,
  scoreExtraction,
  suggestNextAction,
  type AiExtraction,
} from "../src/domain/qualificationScoring";

function makeExtraction(overrides: Partial<AiExtraction> = {}): AiExtraction {
  return {
    isRelevant: true,
    language: "en",
    destination: null,
    city: null,
    travelDates: null,
    travelersCount: null,
    activityCategory: null,
    purchaseIntent: "none",
    urgency: "none",
    signals: {
      asksForPrice: false,
      requestsRecommendation: false,
      mentionsBooking: false,
      hasUpcomingTrip: false,
    },
    evidence: [],
    missingInformation: [],
    confidence: 0.5,
    reasoning: null,
    ...overrides,
  };
}

describe("aiExtractionSchema", () => {
  it("strips unknown keys and validates a well-formed object", () => {
    const parsed = aiExtractionSchema.parse({
      ...makeExtraction({ destination: "Egypt" }),
      somethingExtra: "ignored",
    });
    expect(parsed.destination).toBe("Egypt");
    expect("somethingExtra" in parsed).toBe(false);
  });

  it("rejects an invalid purchaseIntent value", () => {
    const bad = { ...makeExtraction(), purchaseIntent: "maybe" };
    expect(aiExtractionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("computeIntentScore", () => {
  it("scores irrelevant content as 0", () => {
    expect(computeIntentScore(makeExtraction({ isRelevant: false }))).toBe(0);
  });

  it("gives an explicit, urgent, booking-ready lead a hot score", () => {
    const score = computeIntentScore(
      makeExtraction({
        purchaseIntent: "explicit",
        urgency: "high",
        destination: "Egypt",
        city: "Hurghada",
        travelDates: "next week",
        travelersCount: 2,
        activityCategory: "diving",
        signals: {
          asksForPrice: true,
          requestsRecommendation: true,
          mentionsBooking: true,
          hasUpcomingTrip: true,
        },
      }),
    );
    expect(score).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("never exceeds 100", () => {
    const score = computeIntentScore(
      makeExtraction({
        purchaseIntent: "explicit",
        urgency: "high",
        destination: "Egypt",
        city: "Cairo",
        travelDates: "soon",
        travelersCount: 4,
        activityCategory: "city tour",
        signals: {
          asksForPrice: true,
          requestsRecommendation: true,
          mentionsBooking: true,
          hasUpcomingTrip: true,
        },
      }),
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("deriveIntentLevel", () => {
  it("is irrelevant when not relevant regardless of score", () => {
    expect(deriveIntentLevel(makeExtraction({ isRelevant: false }), 99)).toBe(
      "irrelevant",
    );
  });

  it("maps thresholds hot/warm/cold", () => {
    const e = makeExtraction();
    expect(deriveIntentLevel(e, 70)).toBe("hot");
    expect(deriveIntentLevel(e, 40)).toBe("warm");
    expect(deriveIntentLevel(e, 15)).toBe("cold");
    expect(deriveIntentLevel(e, 10)).toBe("irrelevant");
  });
});

describe("suggestNextAction", () => {
  it("prioritizes outreach for hot leads", () => {
    expect(suggestNextAction("hot", makeExtraction())).toBe(
      "prioritize_outreach",
    );
  });

  it("requests more info for warm leads with gaps", () => {
    expect(
      suggestNextAction(
        "warm",
        makeExtraction({ missingInformation: ["travel dates"] }),
      ),
    ).toBe("request_more_info");
  });

  it("nurtures warm leads with no gaps", () => {
    expect(suggestNextAction("warm", makeExtraction())).toBe("nurture");
  });

  it("discards irrelevant leads", () => {
    expect(suggestNextAction("irrelevant", makeExtraction())).toBe("discard");
  });
});

describe("scoreExtraction (pipeline)", () => {
  it("returns a coherent score/level/action triple", () => {
    const result = scoreExtraction(
      makeExtraction({
        purchaseIntent: "explicit",
        urgency: "high",
        signals: {
          asksForPrice: true,
          requestsRecommendation: false,
          mentionsBooking: true,
          hasUpcomingTrip: true,
        },
        destination: "Egypt",
      }),
    );
    expect(result.intentLevel).toBe("hot");
    expect(result.suggestedNextAction).toBe("prioritize_outreach");
    expect(result.intentScore).toBeGreaterThanOrEqual(70);
  });

  it("keeps a relevant but weak lead as cold -> monitor", () => {
    const result = scoreExtraction(
      makeExtraction({
        purchaseIntent: "implicit",
        urgency: "none",
        destination: "Egypt",
      }),
    );
    // implicit(22) + destination(8) = 30 -> cold
    expect(result.intentLevel).toBe("cold");
    expect(result.suggestedNextAction).toBe("monitor");
  });
});

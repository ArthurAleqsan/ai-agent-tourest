import { afterEach, describe, expect, it } from "vitest";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { AiUnavailableError } from "../src/modules/ai/index";
import { MockAiClient, mockHotExtraction } from "../src/modules/ai/mock";
import { createTestDb, type TestDb } from "./helpers/testDb";

/**
 * End-to-end qualification tests using an in-process SQLite DB and a MOCK AI
 * provider — no Ollama required. Covers EN/RU examples, irrelevant content,
 * ambiguous destinations, missing dates, duplicates, malformed AI output, and
 * provider outages.
 */

interface Harness {
  container: AppContainer;
  db: TestDb;
}

const harnesses: Harness[] = [];

function makeHarness(mock: MockAiClient): Harness {
  const db = createTestDb();
  const container = createContainer({
    databasePath: db.databasePath,
    aiClient: mock,
  });
  const h = { container, db };
  harnesses.push(h);
  return h;
}

async function importItem(
  container: AppContainer,
  rawContent: string,
  extra: { url?: string; language?: string } = {},
) {
  const source = await container.sourceRepository.ensureManualSource();
  const { item } = await container.sourceItemRepository.create({
    sourceId: source.id,
    rawContent,
    url: extra.url ?? null,
    language: extra.language ?? null,
  });
  return item;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.container.shutdown();
    h.db.cleanup();
  }
});

describe("QualificationService (mock AI)", () => {
  it("qualifies an English hot lead and persists structured results", async () => {
    const mock = new MockAiClient({ mode: { kind: "text", text: mockHotExtraction() } });
    const { container } = makeHarness(mock);

    const item = await importItem(
      container,
      "Hi! We arrive in Hurghada next month, how much is a diving trip for 2?",
      { language: "en" },
    );
    const q = await container.qualificationService.qualifySourceItem(item.id);

    expect(q.intentLevel).toBe("hot");
    expect(q.intentScore).toBeGreaterThanOrEqual(70);
    expect(q.suggestedNextAction).toBe("prioritize_outreach");
    expect(q.destination).toBe("Egypt");
    expect(q.city).toBe("Hurghada");
    expect(q.model).toBe("mock-model:latest");
    expect(q.modelProvider).toBe("mock");
    expect(q.rawResponse).toContain("isRelevant");
    expect(Array.isArray(q.evidence)).toBe(true);

    // SourceItem is marked processed.
    const refreshed = await container.sourceItemRepository.findById(item.id);
    expect(refreshed?.processedAt).not.toBeNull();
  });

  it("qualifies a Russian enquiry (language preserved, not invented)", async () => {
    const mock = new MockAiClient({
      mode: {
        kind: "json",
        value: {
          isRelevant: true,
          language: "ru",
          destination: "Египет",
          city: "Шарм-эль-Шейх",
          travelDates: null,
          travelersCount: 3,
          activityCategory: "дайвинг",
          purchaseIntent: "explicit",
          urgency: "medium",
          signals: {
            asksForPrice: true,
            requestsRecommendation: false,
            mentionsBooking: false,
            hasUpcomingTrip: true,
          },
          evidence: ["сколько стоит экскурсия", "хотим поехать в Шарм"],
          missingInformation: ["точные даты поездки"],
          confidence: 0.8,
          reasoning: "Явный интерес к бронированию дайвинга.",
        },
      },
    });
    const { container } = makeHarness(mock);

    const item = await importItem(
      container,
      "Здравствуйте! Хотим в Шарм-эль-Шейх, сколько стоит экскурсия на дайвинг на троих?",
      { language: "ru" },
    );
    const q = await container.qualificationService.qualifySourceItem(item.id);

    expect(q.language).toBe("ru");
    expect(q.destination).toBe("Египет");
    expect(q.travelDates).toBeNull(); // never invented
    expect(["hot", "warm"]).toContain(q.intentLevel);
    expect(q.missingInformation).toContain("точные даты поездки");
  });

  it("marks clearly irrelevant content as irrelevant -> discard", async () => {
    const mock = new MockAiClient({
      mode: {
        kind: "json",
        value: {
          isRelevant: false,
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
          confidence: 0.95,
          reasoning: "Unrelated to travel.",
        },
      },
    });
    const { container } = makeHarness(mock);

    const item = await importItem(container, "Best recipe for chocolate cake?");
    const q = await container.qualificationService.qualifySourceItem(item.id);

    expect(q.intentLevel).toBe("irrelevant");
    expect(q.intentScore).toBe(0);
    expect(q.suggestedNextAction).toBe("discard");
  });

  it("handles ambiguous destinations without inventing one", async () => {
    const mock = new MockAiClient({
      mode: {
        kind: "json",
        value: {
          isRelevant: true,
          language: "en",
          destination: null, // ambiguous: "the Red Sea" could be several places
          city: null,
          travelDates: null,
          travelersCount: null,
          activityCategory: "snorkeling",
          purchaseIntent: "implicit",
          urgency: "low",
          signals: {
            asksForPrice: false,
            requestsRecommendation: true,
            mentionsBooking: false,
            hasUpcomingTrip: true,
          },
          evidence: ["thinking about the Red Sea sometime"],
          missingInformation: ["specific destination/city", "dates"],
          confidence: 0.4,
          reasoning: "Vague interest, destination ambiguous.",
        },
      },
    });
    const { container } = makeHarness(mock);

    const item = await importItem(
      container,
      "Thinking about the Red Sea sometime, any snorkeling ideas?",
    );
    const q = await container.qualificationService.qualifySourceItem(item.id);

    expect(q.destination).toBeNull();
    expect(q.missingInformation).toContain("specific destination/city");
    expect(["cold", "warm", "irrelevant"]).toContain(q.intentLevel);
  });

  it("deduplicates processing and supports manual reanalysis", async () => {
    const mock = new MockAiClient({ mode: { kind: "text", text: mockHotExtraction() } });
    const { container } = makeHarness(mock);

    const item = await importItem(container, "We arrive in Cairo next week, book a tour?");

    const first = await container.qualificationService.qualifySourceItem(item.id);
    // Second call without force must NOT re-invoke the model.
    const second = await container.qualificationService.qualifySourceItem(item.id);
    expect(mock.calls).toBe(1);
    expect(second.id).toBe(first.id);

    // Reanalysis forces a fresh model call and keeps the same row (upsert).
    const reanalyzed = await container.qualificationService.reanalyze(item.id);
    expect(mock.calls).toBe(2);
    expect(reanalyzed.id).toBe(first.id);
  });

  it("deduplicates identical imported source items", async () => {
    const mock = new MockAiClient({ mode: { kind: "text", text: mockHotExtraction() } });
    const { container } = makeHarness(mock);

    const a = await importItem(container, "Identical message about Hurghada diving");
    const b = await importItem(container, "Identical message about Hurghada diving");
    expect(b.id).toBe(a.id); // same dedupe key -> same row
  });

  it("rejects malformed AI output gracefully", async () => {
    const mock = new MockAiClient({
      mode: { kind: "text", text: "sorry, I cannot comply (no json here" },
    });
    const { container } = makeHarness(mock);

    const item = await importItem(container, "Any tours in Sharm?");
    await expect(
      container.qualificationService.qualifySourceItem(item.id),
    ).rejects.toThrowError();

    // Nothing persisted on failure.
    const q = await container.qualificationRepository.findBySourceItemId(item.id);
    expect(q).toBeNull();
  });

  it("rejects schema-invalid AI output (missing required fields)", async () => {
    const mock = new MockAiClient({
      mode: { kind: "json", value: { isRelevant: true } },
    });
    const { container } = makeHarness(mock);

    const item = await importItem(container, "Tours in Cairo?");
    await expect(
      container.qualificationService.qualifySourceItem(item.id),
    ).rejects.toThrowError();
  });

  it("surfaces Ollama outages as AiUnavailableError", async () => {
    const mock = new MockAiClient({ mode: { kind: "unavailable", message: "down" } });
    const { container } = makeHarness(mock);

    const item = await importItem(container, "Diving in Hurghada?");
    await expect(
      container.qualificationService.qualifySourceItem(item.id),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("batch qualifyPending counts outage failures without throwing", async () => {
    const mock = new MockAiClient({ mode: { kind: "unavailable" } });
    const { container } = makeHarness(mock);

    await importItem(container, "Trip to Cairo?");
    await importItem(container, "Excursions in Sharm?");

    const result = await container.qualificationService.qualifyPending();
    expect(result.failed).toBe(2);
    expect(result.processed).toBe(0);
  });
});

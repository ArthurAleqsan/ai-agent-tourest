import { afterEach, describe, expect, it } from "vitest";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { tourCatalogCsv, tourCatalogJson } from "./fixtures/tourCatalog";

/**
 * Step 4 integration tests: tour catalog import, matching a qualified request,
 * and the sales-draft human-approval lifecycle. No network, no Ollama — tours
 * come from fixture exports and qualifications are written directly.
 */

interface Harness {
  container: AppContainer;
  db: TestDb;
}

const harnesses: Harness[] = [];

function makeHarness(): Harness {
  const db = createTestDb();
  const container = createContainer({ databasePath: db.databasePath });
  const h = { container, db };
  harnesses.push(h);
  return h;
}

/** Create a source item plus a qualification carrying the given facts. */
async function qualifiedItem(
  container: AppContainer,
  facts: {
    rawContent: string;
    destination?: string | null;
    city?: string | null;
    activityCategory?: string | null;
    language?: string | null;
  },
): Promise<string> {
  const source = await container.sourceRepository.ensureManualSource();
  const { item } = await container.sourceItemRepository.create({
    sourceId: source.id,
    rawContent: facts.rawContent,
  });
  await container.qualificationRepository.upsert({
    sourceItemId: item.id,
    intentScore: 85,
    intentLevel: "hot",
    suggestedNextAction: "prioritize_outreach",
    purchaseIntent: "explicit",
    urgency: "high",
    confidence: 0.9,
    destination: facts.destination ?? null,
    city: facts.city ?? null,
    activityCategory: facts.activityCategory ?? null,
    language: facts.language ?? null,
  });
  return item.id;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.container.shutdown();
    h.db.cleanup();
  }
});

describe("Tour catalog import", () => {
  it("imports a CSV export and stores verified fields + sync timestamp", async () => {
    const { container } = makeHarness();
    const summary = await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    expect(summary.created).toBe(5);
    expect(summary.invalid).toBe(0);

    const tours = await container.tourRepository.listActive();
    expect(tours).toHaveLength(5);
    const noPrice = tours.find((t) => t.externalId === "HRG-SNORKEL-2");
    expect(noPrice?.priceFrom).toBeNull();
    expect(noPrice?.url).toBeNull();
    expect(noPrice?.lastSyncedAt).toBeTruthy();
    expect(noPrice?.languages).toEqual(["ru", "en"]);
  });

  it("imports a JSON export and upserts (no duplicates) on re-import", async () => {
    const { container } = makeHarness();
    const first = await container.tourCatalogService.importFromJson(tourCatalogJson);
    expect(first.created).toBe(1);
    const second = await container.tourCatalogService.importFromJson(tourCatalogJson);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(await container.tourRepository.list()).toHaveLength(1);
  });
});

describe("Tour matching (qualified request)", () => {
  it("returns verified tours for the right destination/activity, excluding others", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);

    const itemId = await qualifiedItem(container, {
      rawContent: "Любые варианты дайвинга в Хургаде?",
      destination: "Hurghada",
      activityCategory: "diving",
      language: "ru",
    });

    const ranked = await container.tourMatchingService.matchForSourceItem(itemId);
    const ids = ranked.map((r) => r.tour.externalId);

    // Best match is the available Hurghada diving tour.
    expect(ranked[0]!.tour.externalId).toBe("HRG-DIVE-1");
    // Wrong destination (Dubai) and Cairo are excluded.
    expect(ids).not.toContain("DXB-DESERT-4");
    expect(ids).not.toContain("CAI-CITY-3");
    // Sold-out Hurghada diving is excluded even though it matches on paper.
    expect(ids).not.toContain("HRG-DIVE-SOLD-5");
    expect(ranked[0]!.matchedOn).toEqual(
      expect.arrayContaining(["destination", "activity"]),
    );

    // Matches are persisted for the request.
    const persisted = await container.tourMatchRepository.listBySourceItem(itemId);
    expect(persisted.length).toBe(ranked.length);
    expect(persisted[0]!.rank).toBe(0);
  });

  it("returns no matches when the destination has no catalog coverage", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    const itemId = await qualifiedItem(container, {
      rawContent: "Diving in Bali?",
      destination: "Bali",
      activityCategory: "diving",
      language: "en",
    });
    const ranked = await container.tourMatchingService.matchForSourceItem(itemId);
    expect(ranked).toEqual([]);
  });
});

describe("Sales draft agent + human approval", () => {
  it("creates a pending draft, supports edit -> approve -> copy", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    const itemId = await qualifiedItem(container, {
      rawContent: "Хочу дайвинг в Хургаде, сколько стоит?",
      destination: "Hurghada",
      activityCategory: "diving",
      language: "ru",
    });

    const draft = await container.messageDraftService.createForSourceItem({
      sourceItemId: itemId,
    });
    // Pending until explicitly approved.
    expect(draft.status).toBe("pending_approval");
    expect(draft.approvalStatus).toBe("pending");
    expect(draft.language).toBe("ru");
    // Russian body recommends the verified diving tour with its price + link.
    expect(draft.body).toContain("Tourest");
    expect(draft.body).toContain("55 USD"); // verified price (RU: "цена от 55 USD")
    expect(draft.body).toContain("https://tourest.online/t/hrg-dive-1");

    // Copying is blocked until approved.
    await expect(container.messageDraftService.copyApproved(draft.id)).rejects.toThrow();

    // Editing returns it to pending and clears any approval metadata.
    const edited = await container.messageDraftService.edit(draft.id, {
      body: draft.body + "\n\nP.S. рад помочь!",
    });
    expect(edited.status).toBe("pending_approval");
    expect(edited.approvalStatus).toBe("pending");

    // Approval does NOT send; it only marks the draft approved.
    const approved = await container.messageDraftService.approve(draft.id, "operator@tourest");
    expect(approved.status).toBe("approved");
    expect(approved.approvalStatus).toBe("approved");
    expect(approved.approvedBy).toBe("operator@tourest");
    expect(approved.approvedAt).toBeTruthy();

    // Now it can be copied for manual sending.
    const copied = await container.messageDraftService.copyApproved(draft.id);
    expect(copied.body).toBe(approved.body);
    expect(copied.language).toBe("ru");
  });

  it("rejects a draft with a reason and blocks copying", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    const itemId = await qualifiedItem(container, {
      rawContent: "Diving in Hurghada please",
      destination: "Hurghada",
      activityCategory: "diving",
      language: "en",
    });
    const draft = await container.messageDraftService.createForSourceItem({
      sourceItemId: itemId,
    });
    const rejected = await container.messageDraftService.reject(draft.id, "tone too salesy");
    expect(rejected.status).toBe("rejected");
    expect(rejected.approvalStatus).toBe("rejected");
    expect(rejected.rejectionReason).toBe("tone too salesy");
    await expect(container.messageDraftService.copyApproved(draft.id)).rejects.toThrow();
  });

  it("never fabricates booking details for tours without price/URL", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    // Snorkeling request -> top match is the no-price, no-URL Giftun tour.
    const itemId = await qualifiedItem(container, {
      rawContent: "Snorkeling in Hurghada?",
      destination: "Hurghada",
      activityCategory: "snorkeling",
      language: "en",
    });
    const draft = await container.messageDraftService.createForSourceItem({
      sourceItemId: itemId,
      limit: 1,
    });
    expect(draft.body).toContain("Giftun Island Snorkeling");
    // No invented URL, currency, or price.
    expect(draft.body).not.toMatch(/https?:\/\//);
    expect(draft.body).not.toMatch(/USD|EUR|\$/);
  });

  it("falls back to English and has no recommendations without a catalog", async () => {
    const { container } = makeHarness();
    // No catalog imported -> no matches -> helpful fallback, still disclosed.
    const itemId = await qualifiedItem(container, {
      rawContent: "Diving somewhere in Egypt",
      destination: "Hurghada",
      activityCategory: "diving",
      language: "en",
    });
    const draft = await container.messageDraftService.createForSourceItem({
      sourceItemId: itemId,
    });
    expect(draft.language).toBe("en");
    expect(draft.body).toContain("Tourest");
    expect(draft.body).not.toMatch(/https?:\/\//);
  });
});

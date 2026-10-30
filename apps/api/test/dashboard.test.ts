import { afterEach, describe, expect, it } from "vitest";
import { analyticsOverviewSchema } from "@tourest/shared";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { tourCatalogCsv } from "./fixtures/tourCatalog";

interface Harness {
  container: AppContainer;
  db: TestDb;
}

const harnesses: Harness[] = [];

function makeHarness(opts: { adminPassword?: string } = {}): Harness {
  const db = createTestDb();
  const container = createContainer({
    databasePath: db.databasePath,
    adminPassword: opts.adminPassword ?? "",
    jobRetryBackoffMs: 1,
  });
  const h = { container, db };
  harnesses.push(h);
  return h;
}

async function seedQualifiedItem(container: AppContainer, content: string) {
  const source = await container.sourceRepository.ensureManualSource();
  const { item } = await container.sourceItemRepository.create({
    sourceId: source.id,
    rawContent: content,
  });
  await container.qualificationRepository.upsert({
    sourceItemId: item.id,
    intentScore: 88,
    intentLevel: "hot",
    suggestedNextAction: "prioritize_outreach",
    purchaseIntent: "explicit",
    urgency: "high",
    confidence: 0.9,
    destination: "Hurghada",
    city: "Hurghada",
    activityCategory: "diving",
    language: "en",
  });
  return item;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.container.shutdown();
    h.db.cleanup();
  }
});

describe("Lead management", () => {
  it("promotes, deduplicates, filters, overrides, and blocks invalid status jumps", async () => {
    const { container } = makeHarness();
    const item = await seedQualifiedItem(container, "Diving in Hurghada next week?");

    const first = await container.leadService.promoteFromSourceItem({
      sourceItemId: item.id,
      displayName: "Alex",
      contactHandle: "alex@example.com",
    });
    expect(first.created).toBe(true);
    expect(first.lead.status).toBe("qualified");

    const dup = await container.leadService.promoteFromSourceItem({
      sourceItemId: item.id,
      displayName: "Alex",
      contactHandle: "alex@example.com",
    });
    expect(dup.created).toBe(false);
    expect(dup.lead.id).toBe(first.lead.id);

    await container.leadService.setNotes(first.lead.id, "Prefers morning boats");
    await container.leadService.overrideQualification(first.lead.id, 95, "human review");

    const listed = await container.leadService.list({
      query: "alex",
      destination: "Hurghada",
      sortBy: "intent",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.intentScore).toBe(95);
    expect(listed[0]?.lead.notes).toBe("Prefers morning boats");
    expect(listed[0]?.sourceItemExcerpt).toContain("Diving");

    await expect(
      container.leadService.updateStatus(first.lead.id, "contacted"),
    ).rejects.toThrow(/Invalid lead pipeline transition/);
  });

  it("blocks contacting a suppressed handle", async () => {
    const { container } = makeHarness();
    const item = await seedQualifiedItem(container, "Looking for snorkeling");
    await container.contactSuppressionService.suppress({
      value: "blocked@example.com",
      reason: "opted out",
    });
    const { lead } = await container.leadService.promoteFromSourceItem({
      sourceItemId: item.id,
      contactHandle: "blocked@example.com",
    });
    expect(lead.contactPermissionStatus).toBe("not_contactable");

    await container.leadService.updateStatus(lead.id, "draft_ready");
    await container.leadService.updateStatus(lead.id, "approved");
    await expect(
      container.leadService.updateStatus(lead.id, "contacted"),
    ).rejects.toThrow(/suppressed/);
  });
});

describe("Analytics", () => {
  it("counts only confirmed rows and does not invent bookings", async () => {
    const { container } = makeHarness();
    const item = await seedQualifiedItem(container, "Need a diving trip");
    const { lead } = await container.leadService.promoteFromSourceItem({
      sourceItemId: item.id,
    });

    const emptyBookings = await container.analyticsService.overview();
    expect(emptyBookings.bookings).toBe(0);
    expect(emptyBookings.qualifiedLeads).toBe(1);
    expect(emptyBookings.hotLeads).toBe(1);
    expect(emptyBookings.collectedSourceItems).toBe(1);

    await container.leadService.updateStatus(lead.id, "draft_ready");
    await container.leadService.updateStatus(lead.id, "approved");
    await container.leadService.updateStatus(lead.id, "contacted");
    await container.leadService.updateStatus(lead.id, "converted");

    const overview = await container.analyticsService.overview();
    analyticsOverviewSchema.parse(overview);
    expect(overview.bookings).toBe(1);
    expect(overview.contactedLeads).toBe(1);
    expect(overview.bySource[0]?.converted).toBe(1);
    expect(overview.bySource[0]?.conversionRate).toBeGreaterThan(0);
  });
});

describe("Privacy deletion", () => {
  it("hard-deletes a lead and records an audit event", async () => {
    const { container } = makeHarness();
    const item = await seedQualifiedItem(container, "Cairo city tour?");
    const { lead } = await container.leadService.promoteFromSourceItem({
      sourceItemId: item.id,
    });
    const ok = await container.dataDeletionService.deleteLead(lead.id);
    expect(ok).toBe(true);
    expect(await container.leadRepository.findById(lead.id)).toBeNull();
    const log = await container.activityLogRepository.recent();
    expect(log.some((e) => e.action === "privacy.lead_deleted")).toBe(true);
  });
});

describe("Local admin authentication", () => {
  it("requires a valid session when a password is configured", () => {
    const { container } = makeHarness({ adminPassword: "secret-pass" });
    expect(container.authService.enabled).toBe(true);
    expect(container.authService.validate("nope")).toBe(false);
    expect(() => container.authService.login("admin", "wrong")).toThrow(
      /Invalid username or password/,
    );
    const session = container.authService.login("admin", "secret-pass");
    expect(container.authService.validate(session.token)).toBe(true);
    container.authService.logout(session.token);
    expect(container.authService.validate(session.token)).toBe(false);
  });
});

describe("Standard jobs", () => {
  it("registers the six orchestration jobs and runs a no-op sweep", async () => {
    const { container } = makeHarness();
    const names = container.jobScheduler.list().map((j) => j.name).sort();
    expect(names).toEqual([
      "ai-qualification",
      "deduplication",
      "draft-generation",
      "follow-up-reminders",
      "source-ingestion",
      "tour-matching",
    ]);

    container.jobScheduler.pause("follow-up-reminders");
    const paused = await container.jobScheduler.runNow("follow-up-reminders");
    expect(paused.status).toBe("skipped");

    const dedupe = await container.jobScheduler.runNow("deduplication");
    expect(dedupe.status).toBe("success");
  });

  it("tour-matching job matches a qualified item from the catalog", async () => {
    const { container } = makeHarness();
    await container.tourCatalogService.importFromCsv(tourCatalogCsv);
    await seedQualifiedItem(container, "Diving in Hurghada please");
    const result = await container.jobScheduler.runNow("tour-matching");
    expect(result.status).toBe("success");
    expect(result.itemsProcessed).toBeGreaterThan(0);
  });
});

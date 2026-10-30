import { afterEach, describe, expect, it } from "vitest";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { MockTelegramClient } from "./helpers/mockTelegramClient";
import { createTestDb, type TestDb } from "./helpers/testDb";
import {
  AUTHORIZED_CHAT_ID,
  OTHER_CHAT_ID,
  telegramUpdatesFixture,
} from "./fixtures/telegramUpdates";
import { facebookCsvFixture, facebookPastedText } from "./fixtures/facebookImport";
import { wordstatCsvFixture } from "./fixtures/wordstat";
import { telegramConfigSchema } from "../src/modules/sources/adapters/telegram/index";

/**
 * Step 3 integration tests. All source responses are mocked (no network, no
 * Ollama, no real Telegram token). Covers the shared pipeline plus the three
 * adapters: dedup, keyword prefilter, chat allowlist, enable/disable, offset
 * persistence, CSV import, and SEO categorization/scoring.
 */

interface Harness {
  container: AppContainer;
  db: TestDb;
}

const harnesses: Harness[] = [];

function makeHarness(telegram?: MockTelegramClient): Harness {
  const db = createTestDb();
  const container = createContainer({
    databasePath: db.databasePath,
    ...(telegram ? { telegramClient: telegram } : {}),
  });
  const h = { container, db };
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) {
    h.container.shutdown();
    h.db.cleanup();
  }
});

describe("Telegram adapter + pipeline", () => {
  it("ingests only allowlisted, on-topic, unique messages and advances offset", async () => {
    const client = new MockTelegramClient(telegramUpdatesFixture);
    const { container } = makeHarness(client);

    const source = await container.sourceRepository.create({
      name: "Sharm group",
      type: "telegram",
      config: {
        monitoredChatIds: [AUTHORIZED_CHAT_ID],
        keywordPrefilter: true,
        offset: 0,
      },
    });

    const summary = await container.ingestionCoordinator.runScheduled(source.id);

    // Adapter keeps 2 records (#1 relevant + #14 duplicate of #1); the off-topic,
    // the non-allowlisted, and the empty messages are filtered before the pipeline.
    expect(summary.received).toBe(2);
    expect(summary.stored).toBe(1);
    expect(summary.duplicates).toBe(1);
    expect(summary.queuedForQualification).toBe(1);

    // Offset advanced past ALL fetched updates (max update_id 14 -> next 15).
    const refreshed = await container.sourceRepository.findById(source.id);
    const cfg = telegramConfigSchema.parse(refreshed?.config ?? {});
    expect(cfg.offset).toBe(15);

    // Stored item carries authorized provenance, not sender identity.
    const unqualified = await container.sourceItemRepository.listUnqualified();
    expect(unqualified).toHaveLength(1);
    const item = unqualified[0]!;
    expect(item.isAuthorizedMessage).toBe(true);
    expect(item.accessPermissionStatus).toBe("authorized");
    expect(item.externalId).toBe(`${AUTHORIZED_CHAT_ID}:1`);
  });

  it("keeps messages from any chat when the allowlist is empty", async () => {
    const client = new MockTelegramClient(telegramUpdatesFixture);
    const { container } = makeHarness(client);
    const source = await container.sourceRepository.create({
      name: "All chats",
      type: "telegram",
      config: { monitoredChatIds: [], keywordPrefilter: true, offset: 0 },
    });

    const summary = await container.ingestionCoordinator.runScheduled(source.id);
    // Now the Hurghada message in OTHER_CHAT_ID also passes the prefilter.
    expect(summary.stored).toBe(2);
    const items = await container.sourceItemRepository.listUnqualified();
    const chatIds = items
      .map((i) => (i.externalId ?? "").split(":")[0])
      .sort();
    expect(chatIds).toEqual([String(AUTHORIZED_CHAT_ID), String(OTHER_CHAT_ID)]);
  });

  it("stores nothing when the source is disabled", async () => {
    const client = new MockTelegramClient(telegramUpdatesFixture);
    const { container } = makeHarness(client);
    const source = await container.sourceRepository.create({
      name: "Disabled",
      type: "telegram",
      isEnabled: false,
      config: { monitoredChatIds: [AUTHORIZED_CHAT_ID], offset: 0 },
    });

    const summary = await container.ingestionCoordinator.runScheduled(source.id);
    expect(summary.stored).toBe(0);
    expect(summary.errors).toContain("source is disabled");
  });

  it("source-ingestion job skips when no enabled telegram sources exist", async () => {
    const { container } = makeHarness(new MockTelegramClient([]));
    const result = await container.jobScheduler.runNow("source-ingestion");
    expect(result.status).toBe("skipped");

    // The run was persisted for observability.
    const runs = await container.jobRunRepository.recent();
    expect(runs.some((r) => r.jobName === "source-ingestion")).toBe(true);
  });
});

describe("Facebook adapter (manual import)", () => {
  it("imports pasted text + CSV as public, deduplicating on re-import", async () => {
    const { container } = makeHarness();
    const source = await container.sourceRepository.create({
      name: "FB group import",
      type: "facebook",
    });

    const input = { text: facebookPastedText, csv: facebookCsvFixture };
    const first = await container.ingestionCoordinator.runManual(source.id, input);
    expect(first.received).toBe(4); // 1 pasted + 3 CSV rows
    expect(first.stored).toBe(4);
    expect(first.duplicates).toBe(0);

    const items = await container.sourceItemRepository.listUnqualified();
    expect(items.every((i) => i.isAuthorizedMessage === false)).toBe(true);
    expect(items.every((i) => i.accessPermissionStatus === "public")).toBe(true);

    // Re-importing the same content stores nothing new.
    const second = await container.ingestionCoordinator.runManual(source.id, input);
    expect(second.stored).toBe(0);
    expect(second.duplicates).toBe(4);
  });

  it("rejects manual input that provides no content", async () => {
    const { container } = makeHarness();
    const source = await container.sourceRepository.create({
      name: "FB empty",
      type: "facebook",
    });
    await expect(
      container.ingestionCoordinator.runManual(source.id, {}),
    ).rejects.toThrow();
  });
});

describe("Yandex Wordstat -> SEO opportunities", () => {
  it("imports, categorizes and scores keywords as SEO opportunities (not leads)", async () => {
    const { container } = makeHarness();
    const source = await container.sourceRepository.create({
      name: "Wordstat Oct",
      type: "yandex_wordstat",
      config: { period: "2026-10" },
    });

    const summary = await container.seoService.importWordstatCsv(
      source.id,
      wordstatCsvFixture,
    );
    expect(summary.received).toBe(5);
    expect(summary.created).toBe(5);
    expect(summary.invalid).toBe(0);

    // No leads/source items were created by the SEO path.
    const items = await container.sourceItemRepository.listUnqualified();
    expect(items).toHaveLength(0);

    const opps = await container.seoOpportunityRepository.list();
    const sharm = opps.find((o) =>
      o.normalizedKeyword.includes("шарм"),
    );
    expect(sharm?.region).toBe("sharm_el_sheikh");
    expect(sharm?.activityCategory).toBe("sightseeing");
    expect(sharm?.commercialIntentLevel).toBe("transactional");
    expect(sharm?.commercialIntentScore).toBe(70);

    const diving = opps.find((o) => o.normalizedKeyword.includes("дайвинг"));
    expect(diving?.region).toBe("hurghada");
    expect(diving?.activityCategory).toBe("diving");
    expect(diving?.commercialIntentLevel).toBe("transactional");
  });

  it("upserts (updates, not duplicates) on re-import", async () => {
    const { container } = makeHarness();
    const source = await container.sourceRepository.create({
      name: "Wordstat",
      type: "yandex_wordstat",
    });
    await container.seoService.importWordstatCsv(source.id, wordstatCsvFixture);
    const second = await container.seoService.importWordstatCsv(
      source.id,
      wordstatCsvFixture,
    );
    expect(second.created).toBe(0);
    expect(second.updated).toBe(5);
    expect((await container.seoOpportunityRepository.list())).toHaveLength(5);
  });

  it("imports nothing when the source is disabled", async () => {
    const { container } = makeHarness();
    const source = await container.sourceRepository.create({
      name: "Wordstat off",
      type: "yandex_wordstat",
      isEnabled: false,
    });
    const summary = await container.seoService.importWordstatCsv(
      source.id,
      wordstatCsvFixture,
    );
    expect(summary.received).toBe(0);
    expect(summary.errors).toContain("source is disabled");
  });
});

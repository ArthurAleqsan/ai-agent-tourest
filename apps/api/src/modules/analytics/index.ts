import { eq, sql } from "drizzle-orm";
import type { AnalyticsOverview, SourceConversion } from "@tourest/shared";
import type { AppDatabase } from "../../db/client";
import { messageDrafts, sourceItems, sources } from "../../db/schema";
import type { LeadRepository } from "../leads/index";

/**
 * Analytics module.
 *
 * CRITICAL: every number here is a count of CONFIRMED rows in the local
 * database. We never fabricate attribution or booking metrics — "bookings" are
 * strictly leads a human explicitly marked as "converted", and conversion
 * rates are computed only from real collected items.
 */

export interface AnalyticsService {
  overview(): Promise<AnalyticsOverview>;
}

const CONTACTED_STATUSES = new Set(["contacted", "replied", "converted"]);
const QUALIFIED_STATUSES = new Set([
  "qualified",
  "draft_ready",
  "approved",
  "contacted",
  "replied",
  "converted",
]);

export class DrizzleAnalyticsService implements AnalyticsService {
  constructor(
    private readonly db: AppDatabase,
    private readonly leadRepo: LeadRepository,
  ) {}

  async overview(): Promise<AnalyticsOverview> {
    const enriched = await this.leadRepo.listEnriched();

    const qualifiedLeads = enriched.filter((e) =>
      QUALIFIED_STATUSES.has(e.lead.status),
    ).length;
    const hotLeads = enriched.filter((e) => e.intentLevel === "hot").length;
    const contactedLeads = enriched.filter((e) =>
      CONTACTED_STATUSES.has(e.lead.status),
    ).length;
    const replies = enriched.filter(
      (e) => e.lead.status === "replied" || e.lead.status === "converted",
    ).length;
    const bookings = enriched.filter(
      (e) => e.lead.status === "converted",
    ).length;

    const [items] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(sourceItems);
    const collectedSourceItems = items?.value ?? 0;

    const [approved] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(messageDrafts)
      .where(eq(messageDrafts.approvalStatus, "approved"));
    const approvedDrafts = approved?.value ?? 0;

    const bySource = await this.sourceConversions(enriched);

    return {
      collectedSourceItems,
      qualifiedLeads,
      hotLeads,
      approvedDrafts,
      contactedLeads,
      replies,
      bookings,
      bySource,
      generatedAt: new Date().toISOString(),
    };
  }

  private async sourceConversions(
    enriched: Awaited<ReturnType<LeadRepository["listEnriched"]>>,
  ): Promise<SourceConversion[]> {
    const srcRows = await this.db
      .select({ id: sources.id, name: sources.name, type: sources.type })
      .from(sources);

    // Count collected items per source.
    const itemCounts = await this.db
      .select({ sourceId: sourceItems.sourceId, value: sql<number>`count(*)` })
      .from(sourceItems)
      .groupBy(sourceItems.sourceId);
    const itemsBySource = new Map<string, number>();
    for (const r of itemCounts) itemsBySource.set(r.sourceId, r.value);

    const leadsBySource = new Map<string, number>();
    const convertedBySource = new Map<string, number>();
    for (const e of enriched) {
      if (!e.sourceId) continue;
      leadsBySource.set(e.sourceId, (leadsBySource.get(e.sourceId) ?? 0) + 1);
      if (e.lead.status === "converted") {
        convertedBySource.set(
          e.sourceId,
          (convertedBySource.get(e.sourceId) ?? 0) + 1,
        );
      }
    }

    return srcRows.map((s) => {
      const collectedItems = itemsBySource.get(s.id) ?? 0;
      const converted = convertedBySource.get(s.id) ?? 0;
      return {
        sourceId: s.id,
        sourceName: s.name,
        sourceType: s.type,
        collectedItems,
        leads: leadsBySource.get(s.id) ?? 0,
        converted,
        conversionRate: collectedItems > 0 ? converted / collectedItems : 0,
      };
    });
  }
}

export function createAnalyticsService(
  db: AppDatabase,
  leadRepo: LeadRepository,
): AnalyticsService {
  return new DrizzleAnalyticsService(db, leadRepo);
}

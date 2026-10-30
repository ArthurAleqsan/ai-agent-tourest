import { desc, eq } from "drizzle-orm";
import { analyzeSeoKeyword } from "@tourest/shared";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  seoOpportunities,
  type NewSeoOpportunityRow,
  type SeoOpportunityRow,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";
import type { SourceRepository } from "../sources/index";
import {
  parseWordstatCsv,
  parseYandexConfig,
} from "../sources/adapters/yandex/index";

/**
 * SEO module.
 *
 * Imports Yandex Wordstat keyword demand (CSV) as aggregate SEOOpportunity
 * records — explicitly NOT leads. Each keyword is normalized, categorized by
 * destination/activity, and scored for commercial intent.
 */

export interface SeoOpportunityRepository {
  upsert(
    values: NewSeoOpportunityRow,
  ): Promise<{ row: SeoOpportunityRow; created: boolean }>;
  list(limit?: number): Promise<SeoOpportunityRow[]>;
  findByDedupeKey(dedupeKey: string): Promise<SeoOpportunityRow | null>;
}

export class DrizzleSeoOpportunityRepository implements SeoOpportunityRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByDedupeKey(dedupeKey: string): Promise<SeoOpportunityRow | null> {
    const [row] = await this.db
      .select()
      .from(seoOpportunities)
      .where(eq(seoOpportunities.dedupeKey, dedupeKey));
    return row ?? null;
  }

  async upsert(
    values: NewSeoOpportunityRow,
  ): Promise<{ row: SeoOpportunityRow; created: boolean }> {
    const existing = await this.findByDedupeKey(values.dedupeKey);
    if (existing) {
      const [row] = await this.db
        .update(seoOpportunities)
        .set({
          demand: values.demand ?? existing.demand,
          commercialIntentScore: values.commercialIntentScore,
          commercialIntentLevel: values.commercialIntentLevel,
          activityCategory: values.activityCategory,
          region: values.region,
          destination: values.destination ?? existing.destination,
          period: values.period ?? existing.period,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(seoOpportunities.id, existing.id))
        .returning();
      return { row: row as SeoOpportunityRow, created: false };
    }
    const [row] = await this.db
      .insert(seoOpportunities)
      .values(values)
      .returning();
    return { row: row as SeoOpportunityRow, created: true };
  }

  async list(limit = 100): Promise<SeoOpportunityRow[]> {
    return this.db
      .select()
      .from(seoOpportunities)
      .orderBy(desc(seoOpportunities.commercialIntentScore))
      .limit(limit);
  }
}

export interface SeoImportSummary {
  sourceId: string;
  received: number;
  created: number;
  updated: number;
  invalid: number;
  errors: string[];
}

export interface SeoService {
  importWordstatCsv(sourceId: string, csv: string): Promise<SeoImportSummary>;
}

export class YandexSeoService implements SeoService {
  constructor(
    private readonly sourceRepo: SourceRepository,
    private readonly seoRepo: SeoOpportunityRepository,
    private readonly activityLog: ActivityLogRepository,
    private readonly logger: Logger,
  ) {}

  async importWordstatCsv(
    sourceId: string,
    csv: string,
  ): Promise<SeoImportSummary> {
    const source = await this.sourceRepo.findById(sourceId);
    if (!source) throw new Error(`Unknown sourceId: ${sourceId}`);

    const summary: SeoImportSummary = {
      sourceId,
      received: 0,
      created: 0,
      updated: 0,
      invalid: 0,
      errors: [],
    };

    if (!source.isEnabled) {
      summary.errors.push("source is disabled");
      return summary;
    }

    const config = parseYandexConfig(source.config);
    const rawRecords = parseWordstatCsv(csv, config);
    summary.received = rawRecords.length;

    for (const raw of rawRecords) {
      const analysis = analyzeSeoKeyword(raw.keyword);
      if (analysis.normalizedKeyword.length === 0) {
        summary.invalid += 1;
        continue;
      }
      const dedupeKey = `${analysis.region}:${analysis.normalizedKeyword}`;

      try {
        const { created } = await this.seoRepo.upsert({
          sourceId,
          keyword: raw.keyword,
          normalizedKeyword: analysis.normalizedKeyword,
          language: raw.language,
          demand: raw.demand,
          region: analysis.region,
          destination: analysis.destination,
          activityCategory: analysis.activityCategory,
          commercialIntentScore: analysis.commercialIntent.score,
          commercialIntentLevel: analysis.commercialIntent.level,
          period: raw.period,
          notes: null,
          dedupeKey,
        });
        if (created) summary.created += 1;
        else summary.updated += 1;
      } catch (err) {
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    await this.activityLog.append({
      entityType: "source",
      entityId: sourceId,
      action: "seo.wordstat_imported",
      actor: "system",
      metadata: {
        received: summary.received,
        created: summary.created,
        updated: summary.updated,
      },
    });

    this.logger.info("wordstat import complete", { ...summary, errors: summary.errors.length });
    return summary;
  }
}

export function createSeoService(
  sourceRepo: SourceRepository,
  seoRepo: SeoOpportunityRepository,
  activityLog: ActivityLogRepository,
  logger: Logger,
): SeoService {
  return new YandexSeoService(sourceRepo, seoRepo, activityLog, logger);
}

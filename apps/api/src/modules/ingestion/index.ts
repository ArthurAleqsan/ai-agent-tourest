import { z } from "zod";
import type { SourceType } from "@tourest/shared";
import type { Logger } from "../../core/logger";
import type { ActivityLogRepository } from "../crm/index";
import type {
  SourceItemRepository,
  SourceRepository,
} from "../sources/index";
import type { RawSourceRecord } from "../sources/adapters/types";

/**
 * Shared ingestion pipeline:
 *   Source -> Normalize -> Validate -> Deduplicate -> Store -> Queue for AI.
 *
 * Deduplication + storage are delegated to the SourceItemRepository (which
 * owns the dedupe-key logic). "Queue for AI qualification" is represented by
 * the QualificationQueue abstraction; the default implementation simply marks
 * the item as pending (unqualified items are later drained by the
 * qualification batch job/endpoint). No AI call is forced here, and NO
 * outbound messaging ever happens.
 */

export interface IngestSummary {
  sourceId: string;
  sourceType: SourceType;
  received: number;
  stored: number;
  duplicates: number;
  invalid: number;
  queuedForQualification: number;
  errors: string[];
}

/** Abstraction for queueing a stored source item for AI qualification. */
export interface QualificationQueue {
  enqueue(sourceItemId: string): Promise<void>;
}

/**
 * Default queue: records a lightweight activity-log entry. The actual AI pass
 * is pull-based (the qualification job processes unqualified items), so this
 * never contacts the model synchronously during ingestion.
 */
export class ActivityLogQualificationQueue implements QualificationQueue {
  constructor(
    private readonly activityLog: ActivityLogRepository,
    private readonly logger: Logger,
  ) {}

  async enqueue(sourceItemId: string): Promise<void> {
    await this.activityLog.append({
      entityType: "source_item",
      entityId: sourceItemId,
      action: "ingestion.queued_for_qualification",
      actor: "system",
    });
    this.logger.debug("queued source item for qualification", { sourceItemId });
  }
}

const recordSchema = z.object({
  content: z.string().min(1).max(20000),
  url: z.string().url().nullable().optional(),
  externalId: z.string().max(512).nullable().optional(),
  language: z.string().max(16).nullable().optional(),
});

export interface IngestionService {
  ingestRecords(
    sourceId: string,
    records: RawSourceRecord[],
  ): Promise<IngestSummary>;
}

export class PipelineIngestionService implements IngestionService {
  constructor(
    private readonly sourceRepo: SourceRepository,
    private readonly sourceItemRepo: SourceItemRepository,
    private readonly queue: QualificationQueue,
    private readonly logger: Logger,
  ) {}

  async ingestRecords(
    sourceId: string,
    records: RawSourceRecord[],
  ): Promise<IngestSummary> {
    const source = await this.sourceRepo.findById(sourceId);
    if (!source) throw new Error(`Unknown sourceId: ${sourceId}`);

    const summary: IngestSummary = {
      sourceId,
      sourceType: source.type,
      received: records.length,
      stored: 0,
      duplicates: 0,
      invalid: 0,
      queuedForQualification: 0,
      errors: [],
    };

    // Respect enable/disable: disabled sources accept nothing.
    if (!source.isEnabled) {
      summary.errors.push("source is disabled");
      return summary;
    }

    for (const raw of records) {
      // 1. Normalize
      const normalized = {
        ...raw,
        content: (raw.content ?? "").replace(/\u0000/g, "").trim(),
      };

      // 2. Validate
      const parsed = recordSchema.safeParse(normalized);
      if (!parsed.success) {
        summary.invalid += 1;
        continue;
      }

      try {
        // 3. Deduplicate + 4. Store
        const { item, created } = await this.sourceItemRepo.create({
          sourceId,
          rawContent: parsed.data.content,
          url: normalized.url ?? null,
          externalId: normalized.externalId ?? null,
          language: normalized.language ?? null,
          ...(normalized.accessPermissionStatus
            ? { accessPermissionStatus: normalized.accessPermissionStatus }
            : {}),
          isAuthorizedMessage: normalized.isAuthorizedMessage ?? false,
          ...(normalized.collectedAt
            ? { collectedAt: normalized.collectedAt }
            : {}),
        });

        if (created) {
          summary.stored += 1;
          // 5. Queue for AI qualification
          await this.queue.enqueue(item.id);
          summary.queuedForQualification += 1;
        } else {
          summary.duplicates += 1;
        }
      } catch (err) {
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    this.logger.info("ingestion complete", {
      ...summary,
      errors: summary.errors.length,
    });
    return summary;
  }
}

export function createIngestionService(
  sourceRepo: SourceRepository,
  sourceItemRepo: SourceItemRepository,
  queue: QualificationQueue,
  logger: Logger,
): IngestionService {
  return new PipelineIngestionService(sourceRepo, sourceItemRepo, queue, logger);
}

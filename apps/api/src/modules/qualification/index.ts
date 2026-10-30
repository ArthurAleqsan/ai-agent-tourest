import { desc, eq } from "drizzle-orm";
import {
  aiExtractionSchema,
  scoreExtraction,
  type AiExtraction,
} from "@tourest/shared";
import { NotFoundError, ValidationError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  qualifications,
  type NewQualificationRow,
  type QualificationRow,
} from "../../db/schema";
import {
  AiResponseError,
  type AiClient,
} from "../ai/index";
import {
  QUALIFICATION_PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
} from "../ai/prompt";
import type { ActivityLogRepository } from "../crm/index";
import type { DrizzleSourceItemRepository } from "../sources/index";

/**
 * Qualification module.
 *
 * Analyzes a SourceItem with the local AI model (extraction only), applies
 * deterministic scoring, and persists a single current qualification per
 * source item. Processing is deduplicated and supports manual reanalysis.
 * It NEVER sends messages and NEVER sets contact permission.
 */

export interface QualificationRepository {
  findBySourceItemId(sourceItemId: string): Promise<QualificationRow | null>;
  findById(id: string): Promise<QualificationRow | null>;
  list(limit?: number): Promise<QualificationRow[]>;
  upsert(values: NewQualificationRow): Promise<QualificationRow>;
}

export class DrizzleQualificationRepository implements QualificationRepository {
  constructor(private readonly db: AppDatabase) {}

  async findBySourceItemId(
    sourceItemId: string,
  ): Promise<QualificationRow | null> {
    const [row] = await this.db
      .select()
      .from(qualifications)
      .where(eq(qualifications.sourceItemId, sourceItemId));
    return row ?? null;
  }

  async findById(id: string): Promise<QualificationRow | null> {
    const [row] = await this.db
      .select()
      .from(qualifications)
      .where(eq(qualifications.id, id));
    return row ?? null;
  }

  async list(limit = 50): Promise<QualificationRow[]> {
    return this.db
      .select()
      .from(qualifications)
      .orderBy(desc(qualifications.intentScore))
      .limit(limit);
  }

  async upsert(values: NewQualificationRow): Promise<QualificationRow> {
    const [row] = await this.db
      .insert(qualifications)
      .values(values)
      .onConflictDoUpdate({
        target: qualifications.sourceItemId,
        set: {
          ...values,
          updatedAt: new Date().toISOString(),
        },
      })
      .returning();
    return row as QualificationRow;
  }
}

export interface QualifyOptions {
  /** Force reanalysis even if a qualification already exists. */
  force?: boolean;
}

export interface QualifyBatchResult {
  processed: number;
  skipped: number;
  failed: number;
  qualificationIds: string[];
}

export interface QualificationService {
  qualifySourceItem(
    sourceItemId: string,
    options?: QualifyOptions,
  ): Promise<QualificationRow>;
  reanalyze(sourceItemId: string): Promise<QualificationRow>;
  qualifyPending(limit?: number): Promise<QualifyBatchResult>;
}

export interface QualificationServiceDeps {
  ai: AiClient;
  sourceItemRepo: DrizzleSourceItemRepository;
  qualificationRepo: QualificationRepository;
  activityLog: ActivityLogRepository;
  logger: Logger;
  promptVersion?: string;
}

/** Extract the first balanced JSON object from arbitrary model text. */
export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  // Fast path: already pure JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to extraction */
  }
  // Strip common code fences, then find the first {...} block.
  const withoutFences = trimmed.replace(/```(?:json)?/gi, "");
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiResponseError("no JSON object found in model output");
  }
  const candidate = withoutFences.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new AiResponseError(
      `model output is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export class LocalQualificationService implements QualificationService {
  private readonly promptVersion: string;

  constructor(private readonly deps: QualificationServiceDeps) {
    this.promptVersion = deps.promptVersion ?? QUALIFICATION_PROMPT_VERSION;
  }

  async qualifySourceItem(
    sourceItemId: string,
    options: QualifyOptions = {},
  ): Promise<QualificationRow> {
    // Deduplicate processing unless a reanalysis is explicitly requested.
    if (!options.force) {
      const existing =
        await this.deps.qualificationRepo.findBySourceItemId(sourceItemId);
      if (existing) {
        this.deps.logger.debug("qualification skipped (already analyzed)", {
          sourceItemId,
        });
        return existing;
      }
    }

    const resolved =
      await this.deps.sourceItemRepo.findByIdWithSourceType(sourceItemId);
    if (!resolved) {
      throw new NotFoundError(`SourceItem ${sourceItemId}`);
    }
    const { item, sourceType } = resolved;

    const result = await this.deps.ai.generate({
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(item, { sourceType }),
      format: "json",
    });

    const extraction = this.validateExtraction(result.text);
    const score = scoreExtraction(extraction);

    const values: NewQualificationRow = {
      sourceItemId: item.id,
      intentScore: score.intentScore,
      intentLevel: score.intentLevel,
      suggestedNextAction: score.suggestedNextAction,
      purchaseIntent: extraction.purchaseIntent,
      urgency: extraction.urgency,
      confidence: extraction.confidence,
      reasoning: extraction.reasoning,
      destination: extraction.destination,
      city: extraction.city,
      travelDates: extraction.travelDates,
      travelersCount: extraction.travelersCount,
      activityCategory: extraction.activityCategory,
      language: extraction.language,
      evidence: extraction.evidence,
      missingInformation: extraction.missingInformation,
      extraction,
      rawResponse: result.text,
      model: result.model,
      modelProvider: result.provider,
      promptVersion: this.promptVersion,
      analyzedAt: new Date().toISOString(),
    };

    const saved = await this.deps.qualificationRepo.upsert(values);
    await this.deps.sourceItemRepo.markProcessed(item.id);
    await this.deps.activityLog.append({
      entityType: "qualification",
      entityId: saved.id,
      action: options.force ? "qualification.reanalyzed" : "qualification.created",
      actor: "ai",
      metadata: {
        sourceItemId: item.id,
        intentScore: score.intentScore,
        intentLevel: score.intentLevel,
        model: result.model,
        promptVersion: this.promptVersion,
      },
    });

    this.deps.logger.info("source item qualified", {
      sourceItemId: item.id,
      intentScore: score.intentScore,
      intentLevel: score.intentLevel,
    });

    return saved;
  }

  reanalyze(sourceItemId: string): Promise<QualificationRow> {
    return this.qualifySourceItem(sourceItemId, { force: true });
  }

  async qualifyPending(limit = 25): Promise<QualifyBatchResult> {
    const pending = await this.deps.sourceItemRepo.listUnqualified(limit);
    const result: QualifyBatchResult = {
      processed: 0,
      skipped: 0,
      failed: 0,
      qualificationIds: [],
    };

    for (const item of pending) {
      try {
        const saved = await this.qualifySourceItem(item.id);
        result.processed += 1;
        result.qualificationIds.push(saved.id);
      } catch (err) {
        result.failed += 1;
        this.deps.logger.warn("qualification failed for item", {
          sourceItemId: item.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return result;
  }

  private validateExtraction(rawText: string): AiExtraction {
    const parsed = parseJsonObject(rawText);
    const validated = aiExtractionSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ValidationError(
        "AI extraction failed schema validation",
        validated.error.issues,
      );
    }
    return validated.data;
  }
}

export function createQualificationService(
  deps: QualificationServiceDeps,
): QualificationService {
  return new LocalQualificationService(deps);
}

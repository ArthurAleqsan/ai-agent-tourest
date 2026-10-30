import { desc, eq, isNull } from "drizzle-orm";
import {
  computeContentHash,
  computeRetentionExpiry,
  computeSourceItemDedupeKey,
  type AccessPermissionStatus,
  type Source,
  type SourceType,
} from "@tourest/shared";
import { NotImplementedError } from "../../core/errors";
import type { AppDatabase } from "../../db/client";
import {
  qualifications,
  sourceItems,
  sources,
  type NewSourceItemRow,
  type NewSourceRow,
  type QualificationRow,
  type SourceItemRow,
  type SourceRow,
} from "../../db/schema";

/**
 * Sources module boundary.
 *
 * A {@link SourceCollector} knows how to fetch public content / authorized
 * messages from one kind of source. Concrete collectors (scraping, feeds, etc.)
 * are NOT implemented in this step - only the abstraction and a registry.
 */

export interface CollectedItem {
  externalId: string | null;
  url: string | null;
  rawContent: string;
  language: string | null;
  collectedAt: string; // ISO timestamp
}

export interface SourceCollector {
  readonly type: SourceType;
  /** Collect raw items from the given source. */
  collect(source: Source): Promise<CollectedItem[]>;
}

export interface SourceCollectorRegistry {
  register(collector: SourceCollector): void;
  get(type: SourceType): SourceCollector | undefined;
  list(): SourceCollector[];
}

export class InMemorySourceCollectorRegistry implements SourceCollectorRegistry {
  private readonly collectors = new Map<SourceType, SourceCollector>();

  register(collector: SourceCollector): void {
    this.collectors.set(collector.type, collector);
  }

  get(type: SourceType): SourceCollector | undefined {
    return this.collectors.get(type);
  }

  list(): SourceCollector[] {
    return [...this.collectors.values()];
  }
}

/**
 * Placeholder collector used until real collectors are built. It is registered
 * nowhere by default; kept here to document the contract and fail loudly if
 * invoked prematurely.
 */
export class NotImplementedCollector implements SourceCollector {
  constructor(public readonly type: SourceType) {}

  async collect(_source: Source): Promise<CollectedItem[]> {
    throw new NotImplementedError(`sources.collect for type "${this.type}"`);
  }
}

export function createSourceCollectorRegistry(): SourceCollectorRegistry {
  // No collectors registered yet (no scraping in this step).
  return new InMemorySourceCollectorRegistry();
}

// ---------------------------------------------------------------------------
// Persistence (real, Drizzle-backed). Exposed via interfaces for DI/testing.
// ---------------------------------------------------------------------------

export interface CreateSourceInput {
  name: string;
  type: SourceType;
  url?: string | null;
  description?: string | null;
  accessPermissionStatus?: AccessPermissionStatus;
  isEnabled?: boolean;
  retentionDays?: number;
  config?: Record<string, unknown> | null;
}

export interface UpdateSourceInput {
  name?: string;
  description?: string | null;
  accessPermissionStatus?: AccessPermissionStatus;
  isEnabled?: boolean;
  retentionDays?: number;
  config?: Record<string, unknown> | null;
}

export interface SourceRepository {
  /** Get or create a default "manual entry" source for human-imported items. */
  ensureManualSource(): Promise<SourceRow>;
  findById(id: string): Promise<SourceRow | null>;
  list(): Promise<SourceRow[]>;
  listByType(type: SourceType): Promise<SourceRow[]>;
  listEnabledByType(type: SourceType): Promise<SourceRow[]>;
  create(input: CreateSourceInput): Promise<SourceRow>;
  update(id: string, patch: UpdateSourceInput): Promise<SourceRow | null>;
  setEnabled(id: string, isEnabled: boolean): Promise<SourceRow | null>;
}

export interface CreateSourceItemInput {
  sourceId: string;
  rawContent: string;
  url?: string | null;
  externalId?: string | null;
  language?: string | null;
  isAuthorizedMessage?: boolean;
  accessPermissionStatus?: AccessPermissionStatus;
  /** Collection timestamp (ISO). Defaults to now when omitted. */
  collectedAt?: string;
}

export interface CreateSourceItemResult {
  item: SourceItemRow;
  /** False when an existing item was returned due to deduplication. */
  created: boolean;
}

export interface SourceItemWithContext {
  item: SourceItemRow;
  sourceName: string | null;
  sourceType: SourceType | null;
  qualification: QualificationRow | null;
}

export interface SourceItemRepository {
  create(input: CreateSourceItemInput): Promise<CreateSourceItemResult>;
  findById(id: string): Promise<SourceItemRow | null>;
  /** Source items that do not yet have a qualification. */
  listUnqualified(limit?: number): Promise<SourceItemRow[]>;
  /** Recent items with source + qualification context (dashboard). */
  listRecent(limit?: number): Promise<SourceItemWithContext[]>;
  markProcessed(id: string, processedAt?: string): Promise<void>;
}

const MANUAL_SOURCE_NAME = "Manual entry";

export class DrizzleSourceRepository implements SourceRepository {
  constructor(private readonly db: AppDatabase) {}

  async ensureManualSource(): Promise<SourceRow> {
    const [existing] = await this.db
      .select()
      .from(sources)
      .where(eq(sources.type, "manual_entry"))
      .limit(1);
    if (existing) return existing;

    const [created] = await this.db
      .insert(sources)
      .values({
        name: MANUAL_SOURCE_NAME,
        type: "manual_entry",
        accessPermissionStatus: "authorized",
        description: "Items imported manually by a human operator.",
      })
      .returning();
    return created as SourceRow;
  }

  async findById(id: string): Promise<SourceRow | null> {
    const [row] = await this.db.select().from(sources).where(eq(sources.id, id));
    return row ?? null;
  }

  async list(): Promise<SourceRow[]> {
    return this.db.select().from(sources).orderBy(desc(sources.createdAt));
  }

  async listByType(type: SourceType): Promise<SourceRow[]> {
    return this.db.select().from(sources).where(eq(sources.type, type));
  }

  async listEnabledByType(type: SourceType): Promise<SourceRow[]> {
    const rows = await this.listByType(type);
    return rows.filter((r) => r.isEnabled);
  }

  async create(input: CreateSourceInput): Promise<SourceRow> {
    const values: NewSourceRow = {
      name: input.name,
      type: input.type,
      url: input.url ?? null,
      description: input.description ?? null,
      ...(input.accessPermissionStatus
        ? { accessPermissionStatus: input.accessPermissionStatus }
        : {}),
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.retentionDays !== undefined
        ? { retentionDays: input.retentionDays }
        : {}),
      config: input.config ?? null,
    };
    const [created] = await this.db.insert(sources).values(values).returning();
    return created as SourceRow;
  }

  async update(id: string, patch: UpdateSourceInput): Promise<SourceRow | null> {
    const set: Partial<NewSourceRow> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.accessPermissionStatus !== undefined)
      set.accessPermissionStatus = patch.accessPermissionStatus;
    if (patch.isEnabled !== undefined) set.isEnabled = patch.isEnabled;
    if (patch.retentionDays !== undefined)
      set.retentionDays = patch.retentionDays;
    if (patch.config !== undefined) set.config = patch.config;

    const [row] = await this.db
      .update(sources)
      .set(set)
      .where(eq(sources.id, id))
      .returning();
    return row ?? null;
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<SourceRow | null> {
    return this.update(id, { isEnabled });
  }
}

export class DrizzleSourceItemRepository implements SourceItemRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly sourceRepo: SourceRepository,
  ) {}

  async create(input: CreateSourceItemInput): Promise<CreateSourceItemResult> {
    const source = await this.sourceRepo.findById(input.sourceId);
    if (!source) {
      throw new Error(`Unknown sourceId: ${input.sourceId}`);
    }

    const collectedAt = input.collectedAt ?? new Date().toISOString();
    const dedupeKey = computeSourceItemDedupeKey({
      sourceType: source.type,
      externalId: input.externalId ?? null,
      url: input.url ?? null,
      rawContent: input.rawContent,
    });

    // Deduplicate on ingestion: return the existing item if already present.
    const [dup] = await this.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.dedupeKey, dedupeKey))
      .limit(1);
    if (dup) return { item: dup, created: false };

    const values: NewSourceItemRow = {
      sourceId: input.sourceId,
      externalId: input.externalId ?? null,
      url: input.url ?? null,
      rawContent: input.rawContent,
      contentHash: computeContentHash(input.rawContent),
      dedupeKey,
      language: input.language ?? null,
      accessPermissionStatus:
        input.accessPermissionStatus ?? source.accessPermissionStatus,
      isAuthorizedMessage: input.isAuthorizedMessage ?? false,
      collectedAt,
      retentionExpiresAt: computeRetentionExpiry(
        collectedAt,
        source.retentionDays,
      ),
    };

    const [created] = await this.db
      .insert(sourceItems)
      .values(values)
      .returning();
    return { item: created as SourceItemRow, created: true };
  }

  async findById(id: string): Promise<SourceItemRow | null> {
    const [row] = await this.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.id, id));
    return row ?? null;
  }

  async listRecent(limit = 100): Promise<SourceItemWithContext[]> {
    const rows = await this.db
      .select({ item: sourceItems, source: sources, q: qualifications })
      .from(sourceItems)
      .leftJoin(sources, eq(sources.id, sourceItems.sourceId))
      .leftJoin(qualifications, eq(qualifications.sourceItemId, sourceItems.id))
      .orderBy(desc(sourceItems.collectedAt))
      .limit(limit);
    return rows.map(({ item, source, q }) => ({
      item,
      sourceName: source?.name ?? null,
      sourceType: (source?.type as SourceType | undefined) ?? null,
      qualification: q ?? null,
    }));
  }

  async listUnqualified(limit = 50): Promise<SourceItemRow[]> {
    const rows = await this.db
      .select()
      .from(sourceItems)
      .leftJoin(
        qualifications,
        eq(qualifications.sourceItemId, sourceItems.id),
      )
      .where(isNull(qualifications.id))
      .orderBy(desc(sourceItems.collectedAt))
      .limit(limit);
    // leftJoin returns { source_items, qualifications } rows.
    return rows.map((r) => r.source_items);
  }

  async markProcessed(id: string, processedAt?: string): Promise<void> {
    await this.db
      .update(sourceItems)
      .set({ processedAt: processedAt ?? new Date().toISOString() })
      .where(eq(sourceItems.id, id));
  }

  /** Resolve a source item together with its source type (for prompts). */
  async findByIdWithSourceType(
    id: string,
  ): Promise<{ item: SourceItemRow; sourceType: SourceType } | null> {
    const [row] = await this.db
      .select({ item: sourceItems, sourceType: sources.type })
      .from(sourceItems)
      .innerJoin(sources, eq(sources.id, sourceItems.sourceId))
      .where(eq(sourceItems.id, id))
      .limit(1);
    return row ?? null;
  }
}

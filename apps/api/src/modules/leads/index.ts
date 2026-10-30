import { desc, eq } from "drizzle-orm";
import {
  categorizeDestination,
  computeLeadDedupeKey,
  InvalidPipelineTransitionError,
  transitionPipeline,
  type LeadPipelineStatus,
  type MarketRegion,
  type SourceType,
} from "@tourest/shared";
import { NotFoundError, ValidationError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  leads,
  qualifications,
  sourceItems,
  sources,
  type LeadRow,
  type NewLeadRow,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";
import type { ContactSuppressionChecker } from "../privacy/index";

/**
 * Leads module.
 *
 * A Lead is created only by promoting a SourceItem (a human/automation action)
 * — a SourceItem is never automatically a contactable person. Leads are
 * deduplicated, carry an operator-facing pipeline status, support notes and
 * manual qualification overrides, and are searchable/filterable/sortable.
 */

export interface EnrichedLead {
  lead: LeadRow;
  /** Effective intent = manual override ?? AI qualification score. */
  intentScore: number | null;
  intentLevel: string | null;
  qualificationId: string | null;
  evidence: string[];
  sourceId: string | null;
  sourceName: string | null;
  sourceType: SourceType | null;
  sourceItemUrl: string | null;
  sourceItemExcerpt: string | null;
}

export interface LeadListFilter {
  query?: string;
  status?: LeadPipelineStatus;
  region?: MarketRegion;
  sourceId?: string;
  destination?: string;
  sortBy?: "intent" | "created";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface PromoteInput {
  sourceItemId: string;
  displayName?: string | null;
  contactHandle?: string | null;
}

export interface LeadRepository {
  create(input: NewLeadRow): Promise<{ lead: LeadRow; created: boolean }>;
  findById(id: string): Promise<LeadRow | null>;
  findByDedupeKey(dedupeKey: string): Promise<LeadRow | null>;
  findBySourceItemId(sourceItemId: string): Promise<LeadRow | null>;
  update(id: string, patch: Partial<NewLeadRow>): Promise<LeadRow | null>;
  delete(id: string): Promise<boolean>;
  /** All leads enriched with their qualification + source context. */
  listEnriched(): Promise<EnrichedLead[]>;
}

export class DrizzleLeadRepository implements LeadRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: NewLeadRow): Promise<{ lead: LeadRow; created: boolean }> {
    const existing = await this.findByDedupeKey(input.dedupeKey);
    if (existing) return { lead: existing, created: false };
    const [row] = await this.db.insert(leads).values(input).returning();
    return { lead: row as LeadRow, created: true };
  }

  async findById(id: string): Promise<LeadRow | null> {
    const [row] = await this.db.select().from(leads).where(eq(leads.id, id));
    return row ?? null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<LeadRow | null> {
    const [row] = await this.db
      .select()
      .from(leads)
      .where(eq(leads.dedupeKey, dedupeKey));
    return row ?? null;
  }

  async findBySourceItemId(sourceItemId: string): Promise<LeadRow | null> {
    const [row] = await this.db
      .select()
      .from(leads)
      .where(eq(leads.sourceItemId, sourceItemId))
      .limit(1);
    return row ?? null;
  }

  async update(id: string, patch: Partial<NewLeadRow>): Promise<LeadRow | null> {
    const [row] = await this.db
      .update(leads)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(leads.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(leads)
      .where(eq(leads.id, id))
      .returning();
    return deleted.length > 0;
  }

  async listEnriched(): Promise<EnrichedLead[]> {
    const rows = await this.db
      .select({ lead: leads, q: qualifications, si: sourceItems, s: sources })
      .from(leads)
      .leftJoin(
        qualifications,
        eq(qualifications.sourceItemId, leads.sourceItemId),
      )
      .leftJoin(sourceItems, eq(sourceItems.id, leads.sourceItemId))
      .leftJoin(sources, eq(sources.id, sourceItems.sourceId))
      .orderBy(desc(leads.createdAt));

    return rows.map(({ lead, q, si, s }) => {
      const intentScore = lead.manualIntentScore ?? q?.intentScore ?? null;
      const intentLevel = lead.manualIntentScore != null
        ? deriveLevelFromScore(lead.manualIntentScore)
        : (q?.intentLevel ?? null);
      return {
        lead,
        intentScore,
        intentLevel,
        qualificationId: q?.id ?? null,
        evidence: q?.evidence ?? [],
        sourceId: s?.id ?? null,
        sourceName: s?.name ?? null,
        sourceType: (s?.type as SourceType | undefined) ?? null,
        sourceItemUrl: si?.url ?? null,
        sourceItemExcerpt: si ? si.rawContent.slice(0, 280) : null,
      };
    });
  }
}

function deriveLevelFromScore(score: number): string {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  if (score >= 15) return "cold";
  return "irrelevant";
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface LeadServiceDeps {
  db: AppDatabase;
  leadRepo: LeadRepository;
  activityLog: ActivityLogRepository;
  suppression: ContactSuppressionChecker;
  logger: Logger;
}

export class LeadService {
  constructor(private readonly deps: LeadServiceDeps) {}

  async promoteFromSourceItem(
    input: PromoteInput,
  ): Promise<{ lead: LeadRow; created: boolean }> {
    const [si] = await this.deps.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.id, input.sourceItemId))
      .limit(1);
    if (!si) throw new NotFoundError(`SourceItem ${input.sourceItemId}`);

    const [q] = await this.deps.db
      .select()
      .from(qualifications)
      .where(eq(qualifications.sourceItemId, input.sourceItemId))
      .limit(1);

    const destinationInterest = q?.destination ?? q?.city ?? null;
    let region: MarketRegion | null = null;
    const hint = `${q?.destination ?? ""} ${q?.city ?? ""}`.trim();
    if (hint.length > 0) {
      const derived = categorizeDestination(hint.toLowerCase());
      region = derived.region === "other" ? null : derived.region;
    }

    const dedupeKey = computeLeadDedupeKey({
      contactHandle: input.contactHandle ?? null,
      displayName: input.displayName ?? null,
      sourceItemId: input.sourceItemId,
    });

    const suppressed = await this.deps.suppression.isSuppressed(
      input.contactHandle,
    );
    const status: LeadPipelineStatus =
      q && q.intentLevel !== "irrelevant" ? "qualified" : "discovered";

    const values: NewLeadRow = {
      sourceItemId: input.sourceItemId,
      displayName: input.displayName ?? null,
      contactHandle: input.contactHandle ?? null,
      region,
      destinationInterest,
      status,
      // Privacy-first: never contactable by default; suppressed stays so.
      contactPermissionStatus: suppressed ? "not_contactable" : "needs_review",
      dedupeKey,
    };

    const result = await this.deps.leadRepo.create(values);
    await this.deps.activityLog.append({
      entityType: "lead",
      entityId: result.lead.id,
      action: result.created ? "lead.promoted" : "lead.promote_deduped",
      actor: "human",
      metadata: { sourceItemId: input.sourceItemId, suppressed },
    });
    return result;
  }

  async updateStatus(
    id: string,
    to: LeadPipelineStatus,
    actor: "human" | "system" = "human",
  ): Promise<LeadRow> {
    const lead = await this.requireLead(id);
    try {
      transitionPipeline(lead.status, to);
    } catch (err) {
      if (err instanceof InvalidPipelineTransitionError) {
        throw new ValidationError(err.message);
      }
      throw err;
    }
    if (to === "contacted") {
      const suppressed = await this.deps.suppression.isSuppressed(
        lead.contactHandle,
      );
      if (suppressed) {
        throw new ValidationError(
          "contact is suppressed; outreach is not allowed",
        );
      }
    }
    const patch: Partial<NewLeadRow> = { status: to };
    if (to === "contacted") patch.lastContactedAt = new Date().toISOString();
    const updated = await this.deps.leadRepo.update(id, patch);
    await this.deps.activityLog.append({
      entityType: "lead",
      entityId: id,
      action: "lead.status_changed",
      actor,
      metadata: { from: lead.status, to },
    });
    return updated as LeadRow;
  }

  async setNotes(id: string, notes: string | null): Promise<LeadRow> {
    await this.requireLead(id);
    const updated = await this.deps.leadRepo.update(id, { notes });
    await this.deps.activityLog.append({
      entityType: "lead",
      entityId: id,
      action: "lead.notes_updated",
      actor: "human",
    });
    return updated as LeadRow;
  }

  async overrideQualification(
    id: string,
    manualIntentScore: number,
    reason: string | null,
  ): Promise<LeadRow> {
    if (manualIntentScore < 0 || manualIntentScore > 100) {
      throw new ValidationError("manualIntentScore must be between 0 and 100");
    }
    const lead = await this.requireLead(id);
    const patch: Partial<NewLeadRow> = {
      manualIntentScore,
      overrideReason: reason,
    };
    // A manual qualification advances a freshly-discovered lead.
    if (lead.status === "discovered") patch.status = "qualified";
    const updated = await this.deps.leadRepo.update(id, patch);
    await this.deps.activityLog.append({
      entityType: "lead",
      entityId: id,
      action: "lead.qualification_overridden",
      actor: "human",
      metadata: { manualIntentScore, reason },
    });
    return updated as LeadRow;
  }

  async list(filter: LeadListFilter = {}): Promise<EnrichedLead[]> {
    let items = await this.deps.leadRepo.listEnriched();

    if (filter.status) {
      items = items.filter((i) => i.lead.status === filter.status);
    }
    if (filter.region) {
      items = items.filter((i) => i.lead.region === filter.region);
    }
    if (filter.sourceId) {
      items = items.filter((i) => i.sourceId === filter.sourceId);
    }
    if (filter.destination) {
      const needle = filter.destination.toLowerCase();
      items = items.filter((i) =>
        (i.lead.destinationInterest ?? "").toLowerCase().includes(needle),
      );
    }
    if (filter.query) {
      const needle = filter.query.toLowerCase();
      items = items.filter((i) =>
        [
          i.lead.displayName,
          i.lead.destinationInterest,
          i.lead.notes,
          i.sourceItemExcerpt,
          i.sourceName,
        ]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(needle)),
      );
    }

    const order = filter.order ?? "desc";
    const dir = order === "asc" ? 1 : -1;
    if (filter.sortBy === "intent") {
      items.sort(
        (a, b) => dir * ((a.intentScore ?? -1) - (b.intentScore ?? -1)),
      );
    } else if (filter.sortBy === "created") {
      items.sort(
        (a, b) => dir * a.lead.createdAt.localeCompare(b.lead.createdAt),
      );
    }

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return items.slice(offset, offset + limit);
  }

  async getById(id: string): Promise<EnrichedLead> {
    const all = await this.deps.leadRepo.listEnriched();
    const found = all.find((i) => i.lead.id === id);
    if (!found) throw new NotFoundError(`Lead ${id}`);
    return found;
  }

  /**
   * Advance a qualified lead to `draft_ready` after a pending sales draft is
   * generated for its source item. No-op if there is no matching lead.
   */
  async markDraftReadyForSourceItem(sourceItemId: string): Promise<void> {
    const lead = await this.deps.leadRepo.findBySourceItemId(sourceItemId);
    if (!lead) return;
    if (lead.status !== "qualified") return;
    await this.updateStatus(lead.id, "draft_ready", "system");
  }

  private async requireLead(id: string): Promise<LeadRow> {
    const lead = await this.deps.leadRepo.findById(id);
    if (!lead) throw new NotFoundError(`Lead ${id}`);
    return lead;
  }
}

export function createLeadService(deps: LeadServiceDeps): LeadService {
  return new LeadService(deps);
}

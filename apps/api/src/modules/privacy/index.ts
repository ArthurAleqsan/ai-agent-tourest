import { and, desc, eq, isNotNull, lt } from "drizzle-orm";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  contactSuppressions,
  leads,
  sourceItems,
  type ContactSuppressionRow,
  type NewContactSuppressionRow,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";

/**
 * Privacy module.
 *
 *  - ContactSuppression: a do-not-contact list. Suppressed contacts must never
 *    be targeted by outreach, regardless of lead status.
 *  - DataDeletion: hard-delete a lead / source item, and purge data whose
 *    retention window has expired.
 *
 * Nothing here ever sends a message; this is purely about restricting and
 * removing data.
 */

export function normalizeContactValue(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Contact suppression
// ---------------------------------------------------------------------------

/** Minimal interface other modules depend on (avoids a hard coupling). */
export interface ContactSuppressionChecker {
  isSuppressed(value: string | null | undefined): Promise<boolean>;
}

export interface ContactSuppressionService extends ContactSuppressionChecker {
  suppress(input: {
    value: string;
    reason?: string | null;
    createdBy?: string | null;
  }): Promise<ContactSuppressionRow>;
  list(limit?: number): Promise<ContactSuppressionRow[]>;
  remove(id: string): Promise<boolean>;
}

export class DrizzleContactSuppressionService
  implements ContactSuppressionService
{
  constructor(
    private readonly db: AppDatabase,
    private readonly activityLog: ActivityLogRepository,
    private readonly logger: Logger,
  ) {}

  async isSuppressed(value: string | null | undefined): Promise<boolean> {
    if (!value || value.trim().length === 0) return false;
    const normalized = normalizeContactValue(value);
    const [row] = await this.db
      .select({ id: contactSuppressions.id })
      .from(contactSuppressions)
      .where(eq(contactSuppressions.normalizedValue, normalized))
      .limit(1);
    return Boolean(row);
  }

  async suppress(input: {
    value: string;
    reason?: string | null;
    createdBy?: string | null;
  }): Promise<ContactSuppressionRow> {
    const normalized = normalizeContactValue(input.value);
    const existing = await this.db
      .select()
      .from(contactSuppressions)
      .where(eq(contactSuppressions.normalizedValue, normalized))
      .limit(1);
    if (existing[0]) return existing[0];

    const values: NewContactSuppressionRow = {
      value: input.value,
      normalizedValue: normalized,
      reason: input.reason ?? null,
      createdBy: input.createdBy ?? null,
    };
    const [row] = await this.db
      .insert(contactSuppressions)
      .values(values)
      .returning();
    await this.activityLog.append({
      entityType: "contact_suppression",
      entityId: row?.id ?? null,
      action: "privacy.contact_suppressed",
      actor: "human",
      metadata: { reason: input.reason ?? null },
    });
    this.logger.info("contact suppressed", { id: row?.id });
    return row as ContactSuppressionRow;
  }

  async list(limit = 200): Promise<ContactSuppressionRow[]> {
    return this.db
      .select()
      .from(contactSuppressions)
      .orderBy(desc(contactSuppressions.createdAt))
      .limit(limit);
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(contactSuppressions)
      .where(eq(contactSuppressions.id, id))
      .returning();
    if (deleted.length > 0) {
      await this.activityLog.append({
        entityType: "contact_suppression",
        entityId: id,
        action: "privacy.contact_unsuppressed",
        actor: "human",
      });
    }
    return deleted.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Data deletion / retention purge
// ---------------------------------------------------------------------------

export interface DeletionResult {
  deleted: number;
}

export interface DataDeletionService {
  deleteLead(id: string): Promise<boolean>;
  deleteSourceItem(id: string): Promise<boolean>;
  purgeExpired(now?: Date): Promise<DeletionResult>;
}

export class DrizzleDataDeletionService implements DataDeletionService {
  constructor(
    private readonly db: AppDatabase,
    private readonly activityLog: ActivityLogRepository,
    private readonly logger: Logger,
  ) {}

  async deleteLead(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(leads)
      .where(eq(leads.id, id))
      .returning();
    const ok = deleted.length > 0;
    if (ok) {
      await this.activityLog.append({
        entityType: "lead",
        entityId: id,
        action: "privacy.lead_deleted",
        actor: "human",
      });
      this.logger.info("lead deleted", { id });
    }
    return ok;
  }

  async deleteSourceItem(id: string): Promise<boolean> {
    // Leads reference source items with onDelete:restrict — remove them first.
    await this.db.delete(leads).where(eq(leads.sourceItemId, id));
    const deleted = await this.db
      .delete(sourceItems)
      .where(eq(sourceItems.id, id))
      .returning();
    const ok = deleted.length > 0;
    if (ok) {
      await this.activityLog.append({
        entityType: "source_item",
        entityId: id,
        action: "privacy.source_item_deleted",
        actor: "human",
      });
    }
    return ok;
  }

  async purgeExpired(now: Date = new Date()): Promise<DeletionResult> {
    const cutoff = now.toISOString();
    const expired = await this.db
      .select({ id: sourceItems.id })
      .from(sourceItems)
      .where(
        and(
          isNotNull(sourceItems.retentionExpiresAt),
          lt(sourceItems.retentionExpiresAt, cutoff),
        ),
      );
    let deleted = 0;
    for (const row of expired) {
      if (await this.deleteSourceItem(row.id)) deleted += 1;
    }
    if (deleted > 0) {
      await this.activityLog.append({
        entityType: "retention",
        entityId: null,
        action: "privacy.retention_purged",
        actor: "system",
        metadata: { deleted },
      });
      this.logger.info("retention purge complete", { deleted });
    }
    return { deleted };
  }
}

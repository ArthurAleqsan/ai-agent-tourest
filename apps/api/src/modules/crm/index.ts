import { desc, eq, sql } from "drizzle-orm";
import type { ActivityActor } from "@tourest/shared";
import type { AppDatabase } from "../../db/client";
import {
  activityLogs,
  leads,
  type ActivityLogRow,
  type LeadRow,
  type NewActivityLogRow,
} from "../../db/schema";

/**
 * CRM module boundary.
 *
 * Unlike the scraping/AI/messaging modules, the CRM persistence layer IS
 * implemented (it is core infrastructure, not an external integration). It is
 * still exposed through interfaces so it can be swapped/mocked via DI.
 */

export interface LeadRepository {
  count(): Promise<number>;
  list(limit?: number): Promise<LeadRow[]>;
  findById(id: string): Promise<LeadRow | null>;
}

export interface ActivityLogRepository {
  append(entry: {
    entityType: string;
    entityId?: string | null;
    action: string;
    actor?: ActivityActor;
    metadata?: Record<string, unknown> | null;
  }): Promise<ActivityLogRow>;
  recent(limit?: number): Promise<ActivityLogRow[]>;
}

export class DrizzleLeadRepository implements LeadRepository {
  constructor(private readonly db: AppDatabase) {}

  async count(): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(leads);
    return row?.value ?? 0;
  }

  async list(limit = 50): Promise<LeadRow[]> {
    return this.db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(limit);
  }

  async findById(id: string): Promise<LeadRow | null> {
    const [row] = await this.db.select().from(leads).where(eq(leads.id, id));
    return row ?? null;
  }
}

export class DrizzleActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly db: AppDatabase) {}

  async append(entry: {
    entityType: string;
    entityId?: string | null;
    action: string;
    actor?: ActivityActor;
    metadata?: Record<string, unknown> | null;
  }): Promise<ActivityLogRow> {
    const values: NewActivityLogRow = {
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      actor: entry.actor ?? "system",
      metadata: entry.metadata ?? null,
    };
    const [row] = await this.db.insert(activityLogs).values(values).returning();
    // `returning()` always yields the inserted row for SQLite.
    return row as ActivityLogRow;
  }

  async recent(limit = 50): Promise<ActivityLogRow[]> {
    return this.db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }
}

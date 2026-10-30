import { desc } from "drizzle-orm";
import type { ActivityActor } from "@tourest/shared";
import type { AppDatabase } from "../../db/client";
import {
  activityLogs,
  type ActivityLogRow,
  type NewActivityLogRow,
} from "../../db/schema";

/**
 * CRM activity-log boundary.
 *
 * The activity log is core infrastructure (audit trail) and is implemented
 * directly. Lead persistence lives in the `leads` module.
 */

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

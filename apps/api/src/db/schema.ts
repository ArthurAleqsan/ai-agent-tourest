import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  ACCESS_PERMISSION_STATUSES,
  ACTIVITY_ACTORS,
  CONTACT_PERMISSION_STATUSES,
  HUMAN_APPROVAL_STATUSES,
  INTENT_LEVELS,
  JOB_RUN_STATUSES,
  LEAD_LIFECYCLE_STATUSES,
  MARKET_REGIONS,
  MESSAGE_DRAFT_STATUSES,
  OUTREACH_CHANNELS,
  SOURCE_TYPES,
} from "@tourest/shared";

/**
 * Drizzle schema for Tourest AI Lead Hunter.
 *
 * Conventions:
 *  - Primary keys are UUID text columns.
 *  - Timestamps are ISO-8601 TEXT (stored in UTC) for portability & readability.
 *  - Booleans are stored as INTEGER (0/1) via `mode: "boolean"`.
 *  - Enum columns use TEXT with an explicit `enum` list mirroring @tourest/shared.
 *  - Structured metadata is stored as TEXT with `mode: "json"`.
 */

const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** Shared id + audit columns. */
const idColumn = text("id")
  .primaryKey()
  .$defaultFn(() => randomUUID());
const createdAt = text("created_at").notNull().default(nowSql);
const updatedAt = text("updated_at").notNull().default(nowSql);

// ---------------------------------------------------------------------------
// sources
// ---------------------------------------------------------------------------
export const sources = sqliteTable(
  "sources",
  {
    id: idColumn,
    name: text("name").notNull(),
    type: text("type", { enum: SOURCE_TYPES }).notNull(),
    url: text("url"),
    description: text("description"),
    accessPermissionStatus: text("access_permission_status", {
      enum: ACCESS_PERMISSION_STATUSES,
    })
      .notNull()
      .default("unknown"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    retentionDays: integer("retention_days").notNull().default(90),
    createdAt,
    updatedAt,
  },
  (t) => ({
    typeIdx: index("sources_type_idx").on(t.type),
  }),
);

// ---------------------------------------------------------------------------
// source_items
//   Public content OR an authorized incoming message.
//   A SourceItem is NOT automatically a contactable Lead.
// ---------------------------------------------------------------------------
export const sourceItems = sqliteTable(
  "source_items",
  {
    id: idColumn,
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    url: text("url"),
    rawContent: text("raw_content").notNull(),
    contentHash: text("content_hash").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    language: text("language"),
    accessPermissionStatus: text("access_permission_status", {
      enum: ACCESS_PERMISSION_STATUSES,
    })
      .notNull()
      .default("unknown"),
    isAuthorizedMessage: integer("is_authorized_message", { mode: "boolean" })
      .notNull()
      .default(false),
    collectedAt: text("collected_at").notNull().default(nowSql),
    retentionExpiresAt: text("retention_expires_at"),
    processedAt: text("processed_at"),
    createdAt,
    updatedAt,
  },
  (t) => ({
    dedupeKeyUnique: uniqueIndex("source_items_dedupe_key_unique").on(t.dedupeKey),
    sourceIdx: index("source_items_source_idx").on(t.sourceId),
    collectedAtIdx: index("source_items_collected_at_idx").on(t.collectedAt),
  }),
);

// ---------------------------------------------------------------------------
// leads
// ---------------------------------------------------------------------------
export const leads = sqliteTable(
  "leads",
  {
    id: idColumn,
    sourceItemId: text("source_item_id")
      .notNull()
      .references(() => sourceItems.id, { onDelete: "restrict" }),
    displayName: text("display_name"),
    contactHandle: text("contact_handle"),
    preferredChannel: text("preferred_channel", { enum: OUTREACH_CHANNELS }),
    region: text("region", { enum: MARKET_REGIONS }),
    destinationInterest: text("destination_interest"),
    lifecycleStatus: text("lifecycle_status", { enum: LEAD_LIFECYCLE_STATUSES })
      .notNull()
      .default("new"),
    approvalStatus: text("approval_status", { enum: HUMAN_APPROVAL_STATUSES })
      .notNull()
      .default("pending"),
    contactPermissionStatus: text("contact_permission_status", {
      enum: CONTACT_PERMISSION_STATUSES,
    })
      .notNull()
      .default("not_contactable"),
    dedupeKey: text("dedupe_key").notNull(),
    retentionExpiresAt: text("retention_expires_at"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (t) => ({
    dedupeKeyUnique: uniqueIndex("leads_dedupe_key_unique").on(t.dedupeKey),
    lifecycleIdx: index("leads_lifecycle_idx").on(t.lifecycleStatus),
    approvalIdx: index("leads_approval_idx").on(t.approvalStatus),
  }),
);

// ---------------------------------------------------------------------------
// qualifications
// ---------------------------------------------------------------------------
export const qualifications = sqliteTable(
  "qualifications",
  {
    id: idColumn,
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    intentLevel: text("intent_level", { enum: INTENT_LEVELS })
      .notNull()
      .default("none"),
    intentScore: real("intent_score").notNull().default(0),
    destination: text("destination"),
    travelWindow: text("travel_window"),
    partySize: integer("party_size"),
    budgetHint: text("budget_hint"),
    rationale: text("rationale"),
    model: text("model"),
    createdAt,
    updatedAt,
  },
  (t) => ({
    leadIdx: index("qualifications_lead_idx").on(t.leadId),
  }),
);

// ---------------------------------------------------------------------------
// tours (Tourest catalogue)
// ---------------------------------------------------------------------------
export const tours = sqliteTable(
  "tours",
  {
    id: idColumn,
    externalId: text("external_id"),
    slug: text("slug"),
    title: text("title").notNull(),
    destination: text("destination").notNull(),
    country: text("country").notNull(),
    category: text("category"),
    durationHours: real("duration_hours"),
    priceFrom: real("price_from"),
    currency: text("currency"),
    url: text("url"),
    description: text("description"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => ({
    externalIdUnique: uniqueIndex("tours_external_id_unique").on(t.externalId),
    destinationIdx: index("tours_destination_idx").on(t.destination),
  }),
);

// ---------------------------------------------------------------------------
// tour_matches
// ---------------------------------------------------------------------------
export const tourMatches = sqliteTable(
  "tour_matches",
  {
    id: idColumn,
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tourId: text("tour_id")
      .notNull()
      .references(() => tours.id, { onDelete: "cascade" }),
    score: real("score").notNull().default(0),
    rank: integer("rank").notNull().default(0),
    rationale: text("rationale"),
    createdAt,
    updatedAt,
  },
  (t) => ({
    leadTourUnique: uniqueIndex("tour_matches_lead_tour_unique").on(
      t.leadId,
      t.tourId,
    ),
    leadIdx: index("tour_matches_lead_idx").on(t.leadId),
  }),
);

// ---------------------------------------------------------------------------
// message_drafts
// ---------------------------------------------------------------------------
export const messageDrafts = sqliteTable(
  "message_drafts",
  {
    id: idColumn,
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    tourMatchId: text("tour_match_id").references(() => tourMatches.id, {
      onDelete: "set null",
    }),
    channel: text("channel", { enum: OUTREACH_CHANNELS })
      .notNull()
      .default("manual"),
    language: text("language").notNull().default("en"),
    subject: text("subject"),
    body: text("body").notNull(),
    status: text("status", { enum: MESSAGE_DRAFT_STATUSES })
      .notNull()
      .default("draft"),
    approvalStatus: text("approval_status", { enum: HUMAN_APPROVAL_STATUSES })
      .notNull()
      .default("pending"),
    approvedBy: text("approved_by"),
    approvedAt: text("approved_at"),
    createdAt,
    updatedAt,
  },
  (t) => ({
    leadIdx: index("message_drafts_lead_idx").on(t.leadId),
    statusIdx: index("message_drafts_status_idx").on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// activity_logs
// ---------------------------------------------------------------------------
export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: idColumn,
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    actor: text("actor", { enum: ACTIVITY_ACTORS }).notNull().default("system"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => ({
    entityIdx: index("activity_logs_entity_idx").on(t.entityType, t.entityId),
    createdAtIdx: index("activity_logs_created_at_idx").on(t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// job_runs
// ---------------------------------------------------------------------------
export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: idColumn,
    jobName: text("job_name").notNull(),
    status: text("status", { enum: JOB_RUN_STATUSES })
      .notNull()
      .default("pending"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    itemsProcessed: integer("items_processed").notNull().default(0),
    error: text("error"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => ({
    jobNameIdx: index("job_runs_job_name_idx").on(t.jobName),
    statusIdx: index("job_runs_status_idx").on(t.status),
  }),
);

/** All tables, handy for migration tooling and tests. */
export const schema = {
  sources,
  sourceItems,
  leads,
  qualifications,
  tours,
  tourMatches,
  messageDrafts,
  activityLogs,
  jobRuns,
};

// Row types inferred from the schema (DB-shaped, distinct from API DTOs).
export type SourceRow = typeof sources.$inferSelect;
export type NewSourceRow = typeof sources.$inferInsert;
export type SourceItemRow = typeof sourceItems.$inferSelect;
export type NewSourceItemRow = typeof sourceItems.$inferInsert;
export type LeadRow = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;
export type QualificationRow = typeof qualifications.$inferSelect;
export type NewQualificationRow = typeof qualifications.$inferInsert;
export type TourRow = typeof tours.$inferSelect;
export type NewTourRow = typeof tours.$inferInsert;
export type TourMatchRow = typeof tourMatches.$inferSelect;
export type NewTourMatchRow = typeof tourMatches.$inferInsert;
export type MessageDraftRow = typeof messageDrafts.$inferSelect;
export type NewMessageDraftRow = typeof messageDrafts.$inferInsert;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type NewActivityLogRow = typeof activityLogs.$inferInsert;
export type JobRunRow = typeof jobRuns.$inferSelect;
export type NewJobRunRow = typeof jobRuns.$inferInsert;

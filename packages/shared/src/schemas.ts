import { z } from "zod";
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
} from "./enums";

/**
 * Zod schemas are the single source of truth for runtime validation AND the
 * static TypeScript entity types (via `z.infer`). The database schema
 * (Drizzle) mirrors these shapes.
 */

/** Primitive building blocks. */
export const idSchema = z.string().min(1);
/** ISO-8601 timestamp string, e.g. "2026-10-30T07:22:00.000Z". */
export const isoTimestampSchema = z.string().datetime();

const baseEntityShape = {
  id: idSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
};

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------
export const sourceSchema = z.object({
  ...baseEntityShape,
  name: z.string().min(1).max(200),
  type: z.enum(SOURCE_TYPES),
  /** Source URL / provenance origin for everything collected under it. */
  url: z.string().url().nullable(),
  description: z.string().max(2000).nullable(),
  /** Access/permission status governing collection from this source. */
  accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES),
  isEnabled: z.boolean(),
  /** Data retention metadata: how long items should be kept, in days. */
  retentionDays: z.number().int().positive().max(3650),
});
export type Source = z.infer<typeof sourceSchema>;

// ---------------------------------------------------------------------------
// SourceItem
//   Public content OR an authorized incoming message.
//   NOTE: a SourceItem is explicitly NOT automatically a contactable Lead.
// ---------------------------------------------------------------------------
export const sourceItemSchema = z.object({
  ...baseEntityShape,
  sourceId: idSchema,
  /** Identifier of the item as known by the origin source (provenance). */
  externalId: z.string().max(512).nullable(),
  /** Canonical URL / provenance of this specific item. */
  url: z.string().url().nullable(),
  /** The public content or authorized incoming message body. */
  rawContent: z.string(),
  /** Deduplication: stable hash of normalized content. */
  contentHash: z.string().min(1),
  /** Deduplication: unique key used to detect re-collected items. */
  dedupeKey: z.string().min(1),
  language: z.string().max(16).nullable(),
  /** Access/permission status for THIS item (may differ from its source). */
  accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES),
  /** True only when this is an incoming message we were authorized to read. */
  isAuthorizedMessage: z.boolean(),
  /** Collection timestamp (when we captured the item). */
  collectedAt: isoTimestampSchema,
  /** Data retention metadata: when this item must be purged/reviewed. */
  retentionExpiresAt: isoTimestampSchema.nullable(),
  /** When ingestion/qualification processed this item (null = not yet). */
  processedAt: isoTimestampSchema.nullable(),
});
export type SourceItem = z.infer<typeof sourceItemSchema>;

// ---------------------------------------------------------------------------
// Lead
//   Created only after a SourceItem is promoted (qualification/human action).
// ---------------------------------------------------------------------------
export const leadSchema = z.object({
  ...baseEntityShape,
  /** Origin SourceItem this lead was promoted from (provenance). */
  sourceItemId: idSchema,
  displayName: z.string().max(200).nullable(),
  /** Privacy-conscious: contact handle stored only when permitted. */
  contactHandle: z.string().max(320).nullable(),
  preferredChannel: z.enum(OUTREACH_CHANNELS).nullable(),
  region: z.enum(MARKET_REGIONS).nullable(),
  destinationInterest: z.string().max(200).nullable(),
  lifecycleStatus: z.enum(LEAD_LIFECYCLE_STATUSES),
  approvalStatus: z.enum(HUMAN_APPROVAL_STATUSES),
  /** Whether we have any basis to contact this person (privacy-first). */
  contactPermissionStatus: z.enum(CONTACT_PERMISSION_STATUSES),
  /** Deduplication across multiple source items for the same person. */
  dedupeKey: z.string().min(1),
  /** Data retention metadata. */
  retentionExpiresAt: isoTimestampSchema.nullable(),
  notes: z.string().max(5000).nullable(),
});
export type Lead = z.infer<typeof leadSchema>;

// ---------------------------------------------------------------------------
// Qualification
// ---------------------------------------------------------------------------
export const qualificationSchema = z.object({
  ...baseEntityShape,
  leadId: idSchema,
  intentLevel: z.enum(INTENT_LEVELS),
  /** Normalized 0..1 confidence score for booking intent. */
  intentScore: z.number().min(0).max(1),
  destination: z.string().max(200).nullable(),
  travelWindow: z.string().max(200).nullable(),
  partySize: z.number().int().positive().max(100).nullable(),
  budgetHint: z.string().max(200).nullable(),
  rationale: z.string().max(5000).nullable(),
  /** AI model used for qualification (null until AI step is implemented). */
  model: z.string().max(200).nullable(),
});
export type Qualification = z.infer<typeof qualificationSchema>;

// ---------------------------------------------------------------------------
// Tour (Tourest catalogue entry)
// ---------------------------------------------------------------------------
export const tourSchema = z.object({
  ...baseEntityShape,
  externalId: z.string().max(200).nullable(),
  slug: z.string().max(200).nullable(),
  title: z.string().min(1).max(300),
  destination: z.string().max(200),
  country: z.string().max(100),
  category: z.string().max(100).nullable(),
  durationHours: z.number().positive().max(720).nullable(),
  priceFrom: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  url: z.string().url().nullable(),
  description: z.string().max(5000).nullable(),
  isActive: z.boolean(),
});
export type Tour = z.infer<typeof tourSchema>;

// ---------------------------------------------------------------------------
// TourMatch
// ---------------------------------------------------------------------------
export const tourMatchSchema = z.object({
  ...baseEntityShape,
  leadId: idSchema,
  tourId: idSchema,
  /** Relevance score 0..1. */
  score: z.number().min(0).max(1),
  rank: z.number().int().nonnegative(),
  rationale: z.string().max(2000).nullable(),
});
export type TourMatch = z.infer<typeof tourMatchSchema>;

// ---------------------------------------------------------------------------
// MessageDraft
// ---------------------------------------------------------------------------
export const messageDraftSchema = z.object({
  ...baseEntityShape,
  leadId: idSchema,
  tourMatchId: idSchema.nullable(),
  channel: z.enum(OUTREACH_CHANNELS),
  language: z.string().max(16),
  subject: z.string().max(300).nullable(),
  body: z.string().max(10000),
  status: z.enum(MESSAGE_DRAFT_STATUSES),
  approvalStatus: z.enum(HUMAN_APPROVAL_STATUSES),
  approvedBy: z.string().max(200).nullable(),
  approvedAt: isoTimestampSchema.nullable(),
});
export type MessageDraft = z.infer<typeof messageDraftSchema>;

// ---------------------------------------------------------------------------
// ActivityLog
// ---------------------------------------------------------------------------
export const activityLogSchema = z.object({
  id: idSchema,
  createdAt: isoTimestampSchema,
  entityType: z.string().max(100),
  entityId: idSchema.nullable(),
  action: z.string().max(200),
  actor: z.enum(ACTIVITY_ACTORS),
  /** Arbitrary structured metadata (stored as JSON). */
  metadata: z.record(z.unknown()).nullable(),
});
export type ActivityLog = z.infer<typeof activityLogSchema>;

// ---------------------------------------------------------------------------
// JobRun
// ---------------------------------------------------------------------------
export const jobRunSchema = z.object({
  id: idSchema,
  createdAt: isoTimestampSchema,
  jobName: z.string().max(200),
  status: z.enum(JOB_RUN_STATUSES),
  startedAt: isoTimestampSchema.nullable(),
  finishedAt: isoTimestampSchema.nullable(),
  itemsProcessed: z.number().int().nonnegative(),
  error: z.string().max(5000).nullable(),
  metadata: z.record(z.unknown()).nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------
export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: isoTimestampSchema,
  checks: z.object({
    database: z.enum(["ok", "error"]),
  }),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;

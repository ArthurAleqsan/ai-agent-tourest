import { z } from "zod";
import {
  ACCESS_PERMISSION_STATUSES,
  ACTIVITY_ACTORS,
  CONTACT_PERMISSION_STATUSES,
  HUMAN_APPROVAL_STATUSES,
  JOB_NAMES,
  JOB_RUN_STATUSES,
  LEAD_LIFECYCLE_STATUSES,
  LEAD_PIPELINE_STATUSES,
  MARKET_REGIONS,
  ACTIVITY_CATEGORIES,
  COMMERCIAL_INTENT_LEVELS,
  MESSAGE_DRAFT_STATUSES,
  OUTREACH_CHANNELS,
  PURCHASE_INTENT_LEVELS,
  QUALIFICATION_INTENT_LEVELS,
  SOURCE_TYPES,
  SUGGESTED_NEXT_ACTIONS,
  URGENCY_LEVELS,
} from "./enums";
import { aiExtractionSchema } from "./domain/qualificationScoring";

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
  /** Operator-facing sales pipeline status shown on the dashboard. */
  status: z.enum(LEAD_PIPELINE_STATUSES),
  approvalStatus: z.enum(HUMAN_APPROVAL_STATUSES),
  /** Manual qualification override (0-100), set by a human; null = use AI. */
  manualIntentScore: z.number().int().min(0).max(100).nullable(),
  /** Reason captured for a manual override. */
  overrideReason: z.string().max(1000).nullable(),
  /** When outreach was last marked as sent by a human (for follow-ups). */
  lastContactedAt: isoTimestampSchema.nullable(),
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
  /** The SourceItem that was analyzed (qualification is item-centric). */
  sourceItemId: idSchema,
  /** Optional link to a promoted Lead (null until promotion). */
  leadId: idSchema.nullable(),

  // --- Deterministic scoring output ---
  /** Integer 0-100 booking-intent score (deterministic). */
  intentScore: z.number().int().min(0).max(100),
  intentLevel: z.enum(QUALIFICATION_INTENT_LEVELS),
  suggestedNextAction: z.enum(SUGGESTED_NEXT_ACTIONS),

  // --- Signals extracted by the AI model ---
  purchaseIntent: z.enum(PURCHASE_INTENT_LEVELS),
  urgency: z.enum(URGENCY_LEVELS),
  /** Model self-reported confidence 0..1. */
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(2000).nullable(),

  // --- Extracted facts (never invented) ---
  destination: z.string().max(200).nullable(),
  city: z.string().max(200).nullable(),
  travelDates: z.string().max(200).nullable(),
  travelersCount: z.number().int().positive().max(100).nullable(),
  activityCategory: z.string().max(200).nullable(),
  language: z.string().max(16).nullable(),
  evidence: z.array(z.string()),
  missingInformation: z.array(z.string()),

  // --- Provenance of the analysis ---
  /** Full validated extraction object (raw structured evidence). */
  extraction: aiExtractionSchema,
  /** Raw model response text, preserved for audit. */
  rawResponse: z.string().nullable(),
  /** AI model name/version used. */
  model: z.string().max(200),
  modelProvider: z.string().max(100),
  promptVersion: z.string().max(50),
  analyzedAt: isoTimestampSchema,
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
  /** Human-readable raw duration as imported (e.g. "Full day"), if provided. */
  durationLabel: z.string().max(100).nullable(),
  /** Languages the tour is offered in (ISO-ish codes/labels). */
  languages: z.array(z.string().max(16)),
  priceFrom: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  url: z.string().url().nullable(),
  description: z.string().max(5000).nullable(),
  /** Provider-supplied availability metadata, if any (never fabricated). */
  availability: z.record(z.unknown()).nullable(),
  /** Last time this tour was synchronized from the catalog provider. */
  lastSyncedAt: isoTimestampSchema.nullable(),
  isActive: z.boolean(),
});
export type Tour = z.infer<typeof tourSchema>;

/**
 * A raw tour record coming from a catalog import (CSV/JSON/authorized API),
 * before it is persisted. Only verified fields are accepted; everything that
 * might be missing is optional/nullable so we never fabricate it.
 */
export const rawTourRecordSchema = z.object({
  externalId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  destination: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
  category: z.string().max(100).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  durationHours: z.number().positive().max(720).nullable().optional(),
  durationLabel: z.string().max(100).nullable().optional(),
  languages: z.array(z.string().max(16)).optional(),
  priceFrom: z.number().nonnegative().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  url: z.string().url().nullable().optional(),
  availability: z.record(z.unknown()).nullable().optional(),
});
export type RawTourRecord = z.infer<typeof rawTourRecordSchema>;

// ---------------------------------------------------------------------------
// TourMatch
// ---------------------------------------------------------------------------
export const tourMatchSchema = z.object({
  ...baseEntityShape,
  /** Lead this match belongs to, once a lead is promoted (nullable). */
  leadId: idSchema.nullable(),
  /** The qualified source item (request) this match was computed for. */
  sourceItemId: idSchema.nullable(),
  tourId: idSchema,
  /** Relevance score 0..1. */
  score: z.number().min(0).max(1),
  rank: z.number().int().nonnegative(),
  /** Structured list of what matched (destination, activity, language, ...). */
  matchedOn: z.array(z.string()),
  rationale: z.string().max(2000).nullable(),
});
export type TourMatch = z.infer<typeof tourMatchSchema>;

// ---------------------------------------------------------------------------
// MessageDraft
// ---------------------------------------------------------------------------
export const messageDraftSchema = z.object({
  ...baseEntityShape,
  /** Lead this draft is for, once a lead is promoted (nullable). */
  leadId: idSchema.nullable(),
  /** The qualified source item (request) this draft responds to. */
  sourceItemId: idSchema.nullable(),
  tourMatchId: idSchema.nullable(),
  channel: z.enum(OUTREACH_CHANNELS),
  language: z.string().max(16),
  subject: z.string().max(300).nullable(),
  body: z.string().max(10000),
  status: z.enum(MESSAGE_DRAFT_STATUSES),
  approvalStatus: z.enum(HUMAN_APPROVAL_STATUSES),
  approvedBy: z.string().max(200).nullable(),
  approvedAt: isoTimestampSchema.nullable(),
  /** Reason captured when a human rejects a draft. */
  rejectionReason: z.string().max(2000).nullable(),
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
// SEOOpportunity
//   Aggregate search-demand signal (e.g. from Yandex Wordstat). NOT a lead and
//   NOT a contactable person — stored separately from source items.
// ---------------------------------------------------------------------------
export const seoOpportunitySchema = z.object({
  ...baseEntityShape,
  /** Source that produced this signal (e.g. a Yandex Wordstat import). */
  sourceId: idSchema,
  /** Original keyword/phrase as imported. */
  keyword: z.string().min(1).max(500),
  /** Normalized keyword used for dedup/analysis. */
  normalizedKeyword: z.string().min(1).max(500),
  language: z.string().max(16).nullable(),
  /** Monthly search demand (Wordstat "shows"), if provided. */
  demand: z.number().int().nonnegative().nullable(),
  region: z.enum(MARKET_REGIONS),
  destination: z.string().max(200).nullable(),
  activityCategory: z.enum(ACTIVITY_CATEGORIES),
  /** Deterministic 0-100 commercial-intent score. */
  commercialIntentScore: z.number().int().min(0).max(100),
  commercialIntentLevel: z.enum(COMMERCIAL_INTENT_LEVELS),
  /** Reporting period label (e.g. "2026-10"), if provided. */
  period: z.string().max(20).nullable(),
  notes: z.string().max(2000).nullable(),
  /** Deduplication key (normalized keyword + region). */
  dedupeKey: z.string().min(1),
});
export type SeoOpportunity = z.infer<typeof seoOpportunitySchema>;

// ---------------------------------------------------------------------------
// ContactSuppression
//   Privacy: a do-not-contact entry. A suppressed contact must never be
//   targeted by outreach, regardless of lead status.
// ---------------------------------------------------------------------------
export const contactSuppressionSchema = z.object({
  id: idSchema,
  createdAt: isoTimestampSchema,
  /** The original contact value (handle/email/username) as entered. */
  value: z.string().min(1).max(320),
  /** Normalized value used for matching. */
  normalizedValue: z.string().min(1).max(320),
  reason: z.string().max(1000).nullable(),
  createdBy: z.string().max(200).nullable(),
});
export type ContactSuppression = z.infer<typeof contactSuppressionSchema>;

// ---------------------------------------------------------------------------
// Analytics (CONFIRMED data only — never fabricated attribution)
// ---------------------------------------------------------------------------
export const sourceConversionSchema = z.object({
  sourceId: idSchema,
  sourceName: z.string(),
  sourceType: z.enum(SOURCE_TYPES),
  collectedItems: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  converted: z.number().int().nonnegative(),
  /** converted / collectedItems, 0..1; 0 when no items. */
  conversionRate: z.number().min(0).max(1),
});
export type SourceConversion = z.infer<typeof sourceConversionSchema>;

export const analyticsOverviewSchema = z.object({
  /** All metrics below are counts of confirmed rows in the local database. */
  collectedSourceItems: z.number().int().nonnegative(),
  qualifiedLeads: z.number().int().nonnegative(),
  hotLeads: z.number().int().nonnegative(),
  approvedDrafts: z.number().int().nonnegative(),
  contactedLeads: z.number().int().nonnegative(),
  replies: z.number().int().nonnegative(),
  /** Confirmed bookings = leads a human marked "converted". */
  bookings: z.number().int().nonnegative(),
  bySource: z.array(sourceConversionSchema),
  generatedAt: isoTimestampSchema,
});
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;

// ---------------------------------------------------------------------------
// Job orchestration views (API responses)
// ---------------------------------------------------------------------------
export const jobConfigSchema = z.object({
  name: z.enum(JOB_NAMES),
  schedule: z.string(),
  enabled: z.boolean(),
  paused: z.boolean(),
  maxRetries: z.number().int().nonnegative(),
  concurrencyLimit: z.number().int().positive(),
  running: z.boolean(),
  description: z.string(),
});
export type JobConfigView = z.infer<typeof jobConfigSchema>;

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

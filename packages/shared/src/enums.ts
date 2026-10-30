/**
 * Centralised enum-like unions for the Tourest AI Lead Hunter domain.
 *
 * These are declared as `const` tuples so they can be reused both as
 * TypeScript union types and as runtime value lists (e.g. for Zod `z.enum`,
 * Drizzle column validation, and UI dropdowns).
 */

/** Where a {@link Source} obtains content from. */
export const SOURCE_TYPES = [
  "web_public", // publicly accessible web page / listing
  "rss_feed", // public RSS/Atom feed
  "authorized_inbox", // messages a user explicitly authorised us to read
  "manual_entry", // a human typed/pasted the item
  "referral", // referred by an existing contact/partner
  "telegram", // authorized Telegram group messages (Bot API)
  "facebook", // manually imported public FB discussion content
  "yandex_wordstat", // Yandex Wordstat keyword demand (aggregate, CSV import)
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * Access / permission status for a Source or SourceItem.
 * Encodes whether we are legally/ethically allowed to process the content.
 */
export const ACCESS_PERMISSION_STATUSES = [
  "public", // publicly available information
  "authorized", // explicit permission/consent to access
  "restricted", // access limited; do not process without review
  "unknown", // provenance unclear; treat conservatively
] as const;
export type AccessPermissionStatus = (typeof ACCESS_PERMISSION_STATUSES)[number];

/**
 * Lifecycle status of a Lead. A SourceItem is NOT a Lead; a Lead only
 * enters this lifecycle after a human/qualification step promotes it.
 */
export const LEAD_LIFECYCLE_STATUSES = [
  "new", // freshly promoted from a SourceItem, not yet qualified
  "qualified", // intent assessed and deemed relevant
  "matched", // relevant Tourest tours attached
  "drafted", // a personalized message draft exists
  "approved", // draft approved by a human, ready to contact
  "contacted", // outreach has been sent (future step)
  "converted", // became a customer / booked
  "rejected", // not a fit / disqualified
  "archived", // closed without conversion / retained for records only
] as const;
export type LeadLifecycleStatus = (typeof LEAD_LIFECYCLE_STATUSES)[number];

/**
 * Step 5 sales-pipeline status for a Lead, as shown on the dashboard.
 * This is the operator-facing pipeline (distinct from the lower-level
 * {@link LEAD_LIFECYCLE_STATUSES} used by the internal state machine).
 */
export const LEAD_PIPELINE_STATUSES = [
  "discovered",
  "qualified",
  "draft_ready",
  "approved",
  "contacted",
  "replied",
  "converted",
  "rejected",
] as const;
export type LeadPipelineStatus = (typeof LEAD_PIPELINE_STATUSES)[number];

/** Configurable background job identifiers (Step 5 orchestration). */
export const JOB_NAMES = [
  "source-ingestion",
  "deduplication",
  "ai-qualification",
  "tour-matching",
  "draft-generation",
  "follow-up-reminders",
] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Human-in-the-loop approval status, used by Leads and MessageDrafts. */
export const HUMAN_APPROVAL_STATUSES = [
  "pending", // awaiting human review
  "approved", // a human approved it
  "rejected", // a human rejected it
  "needs_changes", // human requested edits before approval
] as const;
export type HumanApprovalStatus = (typeof HUMAN_APPROVAL_STATUSES)[number];

/** Strength of travel/booking intent detected during qualification. */
export const INTENT_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
] as const;
export type IntentLevel = (typeof INTENT_LEVELS)[number];

/**
 * Qualification intent buckets (Step 2 AI qualification output).
 * Derived deterministically from the 0-100 intent score.
 */
export const QUALIFICATION_INTENT_LEVELS = [
  "hot",
  "warm",
  "cold",
  "irrelevant",
] as const;
export type QualificationIntentLevel =
  (typeof QUALIFICATION_INTENT_LEVELS)[number];

/** How explicitly a purchase/booking intent is expressed. */
export const PURCHASE_INTENT_LEVELS = [
  "explicit", // clearly wants to book / asks for prices / recommendations
  "implicit", // interested / planning, but no direct buying signal
  "none", // no purchase intent
] as const;
export type PurchaseIntentLevel = (typeof PURCHASE_INTENT_LEVELS)[number];

/** How time-sensitive the request appears. */
export const URGENCY_LEVELS = ["high", "medium", "low", "none"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

/** Suggested next action produced by qualification (advisory only). */
export const SUGGESTED_NEXT_ACTIONS = [
  "prioritize_outreach", // hot: queue for human-approved outreach
  "request_more_info", // promising but missing key info
  "nurture", // warm: keep engaged
  "monitor", // cold: watch for stronger signals
  "discard", // irrelevant
] as const;
export type SuggestedNextAction = (typeof SUGGESTED_NEXT_ACTIONS)[number];

/** Consent/permission to actually contact a lead. */
export const CONTACT_PERMISSION_STATUSES = [
  "not_contactable", // no basis to contact (default, privacy-first)
  "inbound_opt_in", // the person contacted us / opted in
  "explicit_consent", // explicit consent on record
  "needs_review", // requires human review before any contact
] as const;
export type ContactPermissionStatus = (typeof CONTACT_PERMISSION_STATUSES)[number];

/** Outreach channels (integrations NOT implemented in this step). */
export const OUTREACH_CHANNELS = [
  "email",
  "whatsapp",
  "telegram",
  "manual", // human copies the draft and sends it themselves
] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

/** Status of a generated MessageDraft. */
export const MESSAGE_DRAFT_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "sent",
] as const;
export type MessageDraftStatus = (typeof MESSAGE_DRAFT_STATUSES)[number];

/** Status of a background JobRun. */
export const JOB_RUN_STATUSES = [
  "pending",
  "running",
  "success",
  "failed",
  "skipped",
] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/** Actor that performed an action captured in an ActivityLog. */
export const ACTIVITY_ACTORS = ["system", "human", "ai"] as const;
export type ActivityActor = (typeof ACTIVITY_ACTORS)[number];

/** Target markets Tourest currently focuses on. */
export const MARKET_REGIONS = [
  "sharm_el_sheikh",
  "hurghada",
  "cairo",
  "saudi_arabia",
  "other",
] as const;
export type MarketRegion = (typeof MARKET_REGIONS)[number];

/** Activity categories used for tour matching & SEO categorization. */
export const ACTIVITY_CATEGORIES = [
  "diving",
  "snorkeling",
  "desert_safari",
  "boat_trip",
  "city_tour",
  "sightseeing",
  "water_park",
  "dolphin_show",
  "quad_biking",
  "fishing",
  "cultural",
  "other",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Commercial-intent buckets for aggregate SEO demand signals. */
export const COMMERCIAL_INTENT_LEVELS = [
  "transactional", // clear buying intent (price, book, buy)
  "commercial", // comparing / strong purchase consideration
  "informational", // researching, weak purchase intent
  "navigational", // looking for a specific brand/site
] as const;
export type CommercialIntentLevel = (typeof COMMERCIAL_INTENT_LEVELS)[number];

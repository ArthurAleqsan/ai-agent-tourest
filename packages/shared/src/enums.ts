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

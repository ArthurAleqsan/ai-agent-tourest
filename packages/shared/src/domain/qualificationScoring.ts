import { z } from "zod";
import {
  PURCHASE_INTENT_LEVELS,
  QUALIFICATION_INTENT_LEVELS,
  SUGGESTED_NEXT_ACTIONS,
  URGENCY_LEVELS,
  type QualificationIntentLevel,
  type SuggestedNextAction,
} from "../enums";

/**
 * Step 2 — AI qualification: extraction schema + deterministic scoring.
 *
 * The AI model is responsible ONLY for *extraction* (what the text says).
 * The *scoring* (intentScore / intentLevel / next action) is computed by the
 * deterministic rules below, so results are reproducible, explainable, and
 * independent of model temperature. This also keeps purchase intent (a signal)
 * strictly separate from permission to contact (a consent/compliance concern
 * that qualification must never set).
 */

// ---------------------------------------------------------------------------
// Boolean booking signals the model must flag (concrete, evidence-backed).
// ---------------------------------------------------------------------------
export const extractionSignalsSchema = z.object({
  /** Asks for prices / cost. */
  asksForPrice: z.boolean(),
  /** Requests recommendations / suggestions for things to do. */
  requestsRecommendation: z.boolean(),
  /** Mentions booking/reserving/buying an excursion or activity. */
  mentionsBooking: z.boolean(),
  /** Indicates an upcoming/planned trip (not a past trip). */
  hasUpcomingTrip: z.boolean(),
});
export type ExtractionSignals = z.infer<typeof extractionSignalsSchema>;

/**
 * Strict schema for the AI model's JSON output. Unknown keys are stripped.
 * The model must NEVER invent dates, prices, contacts, or identities — fields
 * it cannot ground in the text must be null / false / empty.
 */
export const aiExtractionSchema = z.object({
  /** Whether the content is relevant to travel/excursion booking at all. */
  isRelevant: z.boolean(),
  /** Detected content language (ISO-639-1 where possible), or null. */
  language: z.string().min(2).max(16).nullable(),
  /** Travel destination (country/region), only if present in the text. */
  destination: z.string().max(200).nullable(),
  /** City, only if present in the text. */
  city: z.string().max(200).nullable(),
  /** Approximate travel dates, ONLY if explicitly mentioned. Never invented. */
  travelDates: z.string().max(200).nullable(),
  /** Number of travelers, only if mentioned. */
  travelersCount: z.number().int().positive().max(100).nullable(),
  /** Requested activity category (e.g. diving, desert safari), if present. */
  activityCategory: z.string().max(200).nullable(),
  purchaseIntent: z.enum(PURCHASE_INTENT_LEVELS),
  urgency: z.enum(URGENCY_LEVELS),
  signals: extractionSignalsSchema,
  /** Verbatim excerpts from the source text supporting the extraction. */
  evidence: z.array(z.string().max(500)).max(20),
  /** What information is missing to act on this lead. */
  missingInformation: z.array(z.string().max(200)).max(20),
  /** Model's self-reported confidence 0..1. */
  confidence: z.number().min(0).max(1),
  /** Short natural-language reasoning from the model. */
  reasoning: z.string().max(2000).nullable(),
});
export type AiExtraction = z.infer<typeof aiExtractionSchema>;

// ---------------------------------------------------------------------------
// Deterministic scoring rules
// ---------------------------------------------------------------------------

/** Points assigned to each signal/field. Tuned so explicit+upcoming => hot. */
export const SCORING_WEIGHTS = {
  purchaseIntent: { explicit: 45, implicit: 22, none: 0 },
  urgency: { high: 20, medium: 12, low: 5, none: 0 },
  signals: {
    asksForPrice: 15,
    requestsRecommendation: 10,
    mentionsBooking: 20,
    hasUpcomingTrip: 8,
  },
  fields: {
    destinationOrCity: 8,
    travelDates: 8,
    travelersCount: 4,
    activityCategory: 5,
  },
} as const;

/** Intent-level thresholds applied to the 0-100 score (relevant items only). */
export const INTENT_LEVEL_THRESHOLDS = {
  hot: 70,
  warm: 40,
  cold: 15,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the deterministic 0-100 intent score from an extraction.
 * Irrelevant content always scores 0.
 */
export function computeIntentScore(extraction: AiExtraction): number {
  if (!extraction.isRelevant) return 0;

  const w = SCORING_WEIGHTS;
  let score = 0;

  score += w.purchaseIntent[extraction.purchaseIntent];
  score += w.urgency[extraction.urgency];

  if (extraction.signals.asksForPrice) score += w.signals.asksForPrice;
  if (extraction.signals.requestsRecommendation)
    score += w.signals.requestsRecommendation;
  if (extraction.signals.mentionsBooking) score += w.signals.mentionsBooking;
  if (extraction.signals.hasUpcomingTrip) score += w.signals.hasUpcomingTrip;

  if (extraction.destination || extraction.city)
    score += w.fields.destinationOrCity;
  if (extraction.travelDates) score += w.fields.travelDates;
  if (extraction.travelersCount !== null) score += w.fields.travelersCount;
  if (extraction.activityCategory) score += w.fields.activityCategory;

  return clamp(Math.round(score), 0, 100);
}

/** Map a score (plus relevance) to an intent level. */
export function deriveIntentLevel(
  extraction: AiExtraction,
  score: number,
): QualificationIntentLevel {
  if (!extraction.isRelevant) return "irrelevant";
  if (score >= INTENT_LEVEL_THRESHOLDS.hot) return "hot";
  if (score >= INTENT_LEVEL_THRESHOLDS.warm) return "warm";
  if (score >= INTENT_LEVEL_THRESHOLDS.cold) return "cold";
  return "irrelevant";
}

/** Advisory next action. Never implies permission to contact. */
export function suggestNextAction(
  level: QualificationIntentLevel,
  extraction: AiExtraction,
): SuggestedNextAction {
  switch (level) {
    case "hot":
      return "prioritize_outreach";
    case "warm":
      return extraction.missingInformation.length > 0
        ? "request_more_info"
        : "nurture";
    case "cold":
      return "monitor";
    case "irrelevant":
    default:
      return "discard";
  }
}

export interface QualificationScore {
  intentScore: number;
  intentLevel: QualificationIntentLevel;
  suggestedNextAction: SuggestedNextAction;
}

/** Run the full deterministic scoring pipeline over an extraction. */
export function scoreExtraction(extraction: AiExtraction): QualificationScore {
  const intentScore = computeIntentScore(extraction);
  const intentLevel = deriveIntentLevel(extraction, intentScore);
  const suggestedNextAction = suggestNextAction(intentLevel, extraction);
  return { intentScore, intentLevel, suggestedNextAction };
}

/** Exported for prompt builders / tests: the enum values the model may use. */
export const QUALIFICATION_ENUMS = {
  intentLevels: QUALIFICATION_INTENT_LEVELS,
  purchaseIntent: PURCHASE_INTENT_LEVELS,
  urgency: URGENCY_LEVELS,
  nextActions: SUGGESTED_NEXT_ACTIONS,
} as const;

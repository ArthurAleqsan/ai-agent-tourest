import type { MarketRegion } from "../enums";
import { normalizeText } from "./dedupe";

/**
 * Tour matching (pure, dependency-free, deterministic).
 *
 * Given a qualified travel request, rank up to N relevant Tourest tours:
 *   1. Filter by destination.
 *   2. Match requested activities.
 *   3. Check availability ONLY when reliable data exists.
 *   4. Rank up to three.
 *   5. Explain why each tour matches.
 *
 * HARD RULE: this module NEVER invents prices, availability, discounts, or
 * booking URLs. It only reads verified fields already present on a tour. When
 * a field is missing it is simply omitted from the rationale / score.
 */

/** A qualified travel request distilled from a Qualification. */
export interface TravelRequest {
  destination: string | null;
  city: string | null;
  region: MarketRegion | null;
  activityCategory: string | null;
  /** Free-text travel dates, only if explicitly provided (never invented). */
  travelDates: string | null;
  travelersCount: number | null;
  /** Preferred/detected language (ISO-639-ish), only if known. */
  language: string | null;
}

/** The subset of verified tour fields the matcher reads. */
export interface MatchableTour {
  id: string;
  externalId: string | null;
  title: string;
  destination: string;
  country: string;
  category: string | null;
  description: string | null;
  languages: string[];
  durationHours: number | null;
  durationLabel: string | null;
  priceFrom: number | null;
  currency: string | null;
  url: string | null;
  /** Provider-supplied availability metadata, if any (never fabricated). */
  availability: Record<string, unknown> | null;
  isActive: boolean;
}

export interface RankedTour {
  tour: MatchableTour;
  /** Raw additive score. */
  score: number;
  /** Score normalized to 0..1 (for persistence as TourMatch.score). */
  scoreNormalized: number;
  /** Structured list of what matched (e.g. "destination", "activity"). */
  matchedOn: string[];
  /** Human-readable explanation of why this tour matches (facts only). */
  rationale: string;
}

export interface MatchOptions {
  /** Max tours to return (spec: up to three). */
  limit?: number;
}

export const TOUR_MATCH_WEIGHTS = {
  destinationCity: 50,
  destinationRegion: 25,
  activityCategory: 30,
  activityKeyword: 15,
  languageSupported: 10,
  availabilityConfirmed: 10,
  durationKnown: 5,
} as const;

/** Upper bound used to normalize the additive score into 0..1. */
const MAX_SCORE = 100;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lang2(value: string | null): string {
  return (value ?? "").toLowerCase().trim().slice(0, 2);
}

/**
 * Decide whether a tour is bookable RIGHT NOW based ONLY on reliable data.
 * Inactive tours, or tours whose availability metadata explicitly says they
 * are unavailable/sold out, are excluded. Absence of data is NOT treated as
 * unavailable (we simply don't claim availability later).
 */
export function isTourAvailable(tour: MatchableTour): boolean {
  if (!tour.isActive) return false;
  const a = tour.availability;
  if (a && typeof a === "object") {
    if (a["available"] === false) return false;
    if (a["soldOut"] === true) return false;
    if (a["inStock"] === false) return false;
    if (typeof a["spotsLeft"] === "number" && a["spotsLeft"] <= 0) return false;
  }
  return true;
}

/** True only when availability metadata explicitly confirms availability. */
export function hasConfirmedAvailability(tour: MatchableTour): boolean {
  const a = tour.availability;
  if (!a || typeof a !== "object") return false;
  if (a["available"] === true) return true;
  if (typeof a["spotsLeft"] === "number" && a["spotsLeft"] > 0) return true;
  return false;
}

function buildRationale(
  request: TravelRequest,
  tour: MatchableTour,
  matchedOn: string[],
): string {
  const parts: string[] = [];
  if (matchedOn.includes("destination")) {
    parts.push(`matches the requested destination (${tour.destination})`);
  }
  if (matchedOn.includes("activity") && request.activityCategory) {
    parts.push(`covers the requested activity (${request.activityCategory})`);
  }
  if (matchedOn.includes("language") && request.language) {
    parts.push(`offered in ${lang2(request.language)}`);
  }
  if (matchedOn.includes("availability")) {
    parts.push("has confirmed availability");
  }
  if (tour.durationHours != null) {
    parts.push(`duration ~${tour.durationHours}h`);
  } else if (tour.durationLabel) {
    parts.push(`duration ${tour.durationLabel}`);
  }
  if (parts.length === 0) return `Relevant Tourest tour: ${tour.title}.`;
  return `"${tour.title}" ${parts.join(", ")}.`;
}

/**
 * Rank tours for a travel request. Returns up to `limit` ranked tours, each
 * with an explanation. Returns an empty array when nothing reliably matches
 * (e.g. wrong destination, no activity overlap, or no request signals).
 */
export function matchTours(
  request: TravelRequest,
  tours: MatchableTour[],
  options: MatchOptions = {},
): RankedTour[] {
  const limit = options.limit ?? 3;

  const reqCity = normalizeText(request.city ?? "");
  const reqDest = normalizeText(request.destination ?? "");
  const reqActivity = normalizeText(request.activityCategory ?? "");
  const reqLang = lang2(request.language);
  const requestHasDestination = reqCity.length > 0 || reqDest.length > 0;
  const requestHasActivity = reqActivity.length > 0;

  // Without any destination or activity signal we cannot match reliably.
  if (!requestHasDestination && !requestHasActivity) return [];

  const ranked: RankedTour[] = [];

  for (const tour of tours) {
    if (!isTourAvailable(tour)) continue;

    const dest = normalizeText(tour.destination);
    const country = normalizeText(tour.country);
    const haystack = normalizeText(
      `${tour.destination} ${tour.country} ${tour.title} ${tour.description ?? ""}`,
    );

    const matchedOn: string[] = [];
    let score = 0;

    // 1. Destination filter.
    let destinationMatched = false;
    if (reqCity.length > 0 && (dest.includes(reqCity) || haystack.includes(reqCity))) {
      score += TOUR_MATCH_WEIGHTS.destinationCity;
      destinationMatched = true;
    } else if (
      reqDest.length > 0 &&
      (dest.includes(reqDest) || country.includes(reqDest) || haystack.includes(reqDest))
    ) {
      score += TOUR_MATCH_WEIGHTS.destinationRegion;
      destinationMatched = true;
    }
    if (destinationMatched) matchedOn.push("destination");
    // When the request names a destination, exclude tours elsewhere.
    if (requestHasDestination && !destinationMatched) continue;

    // 2. Activity match.
    let activityMatched = false;
    if (requestHasActivity) {
      const cat = normalizeText(tour.category ?? "");
      if (cat.length > 0 && (cat.includes(reqActivity) || reqActivity.includes(cat))) {
        score += TOUR_MATCH_WEIGHTS.activityCategory;
        activityMatched = true;
      } else if (haystack.includes(reqActivity)) {
        score += TOUR_MATCH_WEIGHTS.activityKeyword;
        activityMatched = true;
      }
      if (activityMatched) matchedOn.push("activity");
    }
    // If destination wasn't specified, require an activity match to qualify.
    if (!requestHasDestination && !activityMatched) continue;

    // 3. Availability (only when reliable data exists).
    if (hasConfirmedAvailability(tour)) {
      score += TOUR_MATCH_WEIGHTS.availabilityConfirmed;
      matchedOn.push("availability");
    }

    // Language support (a verified tour attribute).
    if (reqLang.length > 0 && tour.languages.some((l) => lang2(l) === reqLang)) {
      score += TOUR_MATCH_WEIGHTS.languageSupported;
      matchedOn.push("language");
    }

    // Duration known (minor completeness signal).
    if (tour.durationHours != null || tour.durationLabel) {
      score += TOUR_MATCH_WEIGHTS.durationKnown;
    }

    if (score <= 0) continue;

    ranked.push({
      tour,
      score,
      scoreNormalized: clamp(score / MAX_SCORE, 0, 1),
      matchedOn,
      rationale: buildRationale(request, tour, matchedOn),
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.tour.title.localeCompare(b.tour.title));
  return ranked.slice(0, limit);
}

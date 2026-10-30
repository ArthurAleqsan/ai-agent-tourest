import { normalizeText } from "./dedupe";

/**
 * Egypt-excursion keyword prefilter.
 *
 * Used by source adapters (e.g. Telegram) to cheaply discard obviously
 * irrelevant messages BEFORE storing or spending AI qualification. It is
 * deliberately simple, bilingual (English + Russian, the two dominant
 * languages for this market), and dependency-free so it runs anywhere.
 *
 * Matching is OR-based within two groups and the result is relevant when the
 * text mentions EITHER a known Egyptian destination OR an excursion/booking
 * keyword. This favors recall; the AI qualification step refines precision.
 */

/** Egyptian destinations (and common misspellings / RU forms). */
export const EGYPT_DESTINATION_TERMS = [
  "egypt",
  "египет",
  "египте",
  "sharm",
  "sharm el sheikh",
  "sharm el-sheikh",
  "шарм",
  "шарм-эль-шейх",
  "hurghada",
  "хургада",
  "хургаде",
  "cairo",
  "каир",
  "dahab",
  "дахаб",
  "marsa alam",
  "марса алам",
  "red sea",
  "красное море",
  "nile",
  "нил",
  "luxor",
  "луксор",
  "giza",
  "гиза",
  "pyramids",
  "пирамиды",
] as const;

/** Excursion / booking / activity intent terms. */
export const EXCURSION_TERMS = [
  "excursion",
  "excursions",
  "экскурсия",
  "экскурсии",
  "tour",
  "tours",
  "тур",
  "туры",
  "trip",
  "trips",
  "поездка",
  "diving",
  "дайвинг",
  "snorkeling",
  "снорклинг",
  "safari",
  "сафари",
  "boat trip",
  "booking",
  "book",
  "забронировать",
  "бронь",
  "price",
  "prices",
  "цена",
  "цены",
  "стоимость",
  "recommend",
  "recommendation",
  "посоветуйте",
  "guide",
  "гид",
] as const;

export interface KeywordFilterResult {
  matched: boolean;
  matchedDestinations: string[];
  matchedExcursionTerms: string[];
}

function findMatches(haystack: string, terms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of terms) {
    // Word-ish boundary check: term surrounded by non-letter or string edges.
    if (haystack.includes(term)) found.push(term);
  }
  return found;
}

/** Inspect text and report destination / excursion keyword matches. */
export function analyzeEgyptExcursionKeywords(text: string): KeywordFilterResult {
  const normalized = normalizeText(text);
  const matchedDestinations = findMatches(normalized, EGYPT_DESTINATION_TERMS);
  const matchedExcursionTerms = findMatches(normalized, EXCURSION_TERMS);
  return {
    matched: matchedDestinations.length > 0 || matchedExcursionTerms.length > 0,
    matchedDestinations,
    matchedExcursionTerms,
  };
}

/** Convenience boolean predicate for prefiltering. */
export function passesEgyptExcursionPrefilter(text: string): boolean {
  return analyzeEgyptExcursionKeywords(text).matched;
}

import {
  type ActivityCategory,
  type CommercialIntentLevel,
  type MarketRegion,
} from "../enums";

/**
 * Yandex Wordstat / SEO domain logic (pure, dependency-free).
 *
 * Wordstat records are AGGREGATE demand signals (how many people searched a
 * phrase), NOT individual leads. These helpers normalize a raw keyword and
 * derive destination, activity category, and commercial intent so SEO
 * opportunities can be tracked and prioritized.
 */

/** Normalize a raw Wordstat phrase: strip operators, collapse, lowercase. */
export function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    // Remove Wordstat query operators: + ! " [ ] ( ) | -
    .replace(/[+!"[\]()|]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface TermMap<T extends string> {
  value: T;
  terms: readonly string[];
}

const DESTINATION_TERMS: TermMap<MarketRegion>[] = [
  {
    value: "sharm_el_sheikh",
    terms: ["sharm", "шарм", "шарм-эль-шейх", "sharm el sheikh"],
  },
  { value: "hurghada", terms: ["hurghada", "хургада", "хургаде"] },
  { value: "cairo", terms: ["cairo", "каир", "giza", "гиза", "pyramids", "пирамиды"] },
  {
    value: "saudi_arabia",
    terms: ["saudi", "саудовская", "jeddah", "джидда", "riyadh", "эр-рияд"],
  },
];

const ACTIVITY_TERMS: TermMap<ActivityCategory>[] = [
  { value: "diving", terms: ["diving", "dive", "дайвинг", "дайвинг-тур"] },
  { value: "snorkeling", terms: ["snorkel", "snorkeling", "снорклинг", "снорк"] },
  { value: "desert_safari", terms: ["safari", "сафари", "quad", "квадроцикл", "desert"] },
  { value: "boat_trip", terms: ["boat", "yacht", "лодк", "яхт", "катер", "морская прогулка"] },
  { value: "city_tour", terms: ["city tour", "экскурсия по городу", "обзорная"] },
  { value: "sightseeing", terms: ["sightseeing", "достопримечательности", "pyramids", "пирамиды", "luxor", "луксор"] },
  { value: "water_park", terms: ["water park", "aqua park", "аквапарк"] },
  { value: "dolphin_show", terms: ["dolphin", "дельфин"] },
  { value: "fishing", terms: ["fishing", "рыбалка"] },
];

/** Commercial / transactional modifiers (EN + RU). */
const TRANSACTIONAL_TERMS = [
  "price",
  "prices",
  "cost",
  "buy",
  "book",
  "booking",
  "order",
  "цена",
  "цены",
  "стоимость",
  "купить",
  "заказать",
  "забронировать",
  "бронирование",
  "дешево",
  "недорого",
  "онлайн",
] as const;

const COMMERCIAL_TERMS = [
  "best",
  "top",
  "compare",
  "review",
  "reviews",
  "лучшие",
  "топ",
  "отзывы",
  "сравнить",
  "рейтинг",
] as const;

const NAVIGATIONAL_TERMS = ["tourest", "турест"] as const;

function matchAny(normalized: string, terms: readonly string[]): string[] {
  return terms.filter((t) => normalized.includes(t));
}

export interface DestinationCategorization {
  region: MarketRegion;
  /** Human-readable destination label if a specific one matched. */
  destination: string | null;
}

/** Categorize the destination/region referenced by a normalized keyword. */
export function categorizeDestination(
  normalizedKeyword: string,
): DestinationCategorization {
  for (const entry of DESTINATION_TERMS) {
    if (matchAny(normalizedKeyword, entry.terms).length > 0) {
      return { region: entry.value, destination: entry.value };
    }
  }
  // Generic Egypt mention without a specific city.
  if (matchAny(normalizedKeyword, ["egypt", "египет", "egyptian"]).length > 0) {
    return { region: "other", destination: "egypt" };
  }
  return { region: "other", destination: null };
}

/** Categorize the activity referenced by a normalized keyword. */
export function categorizeActivity(normalizedKeyword: string): ActivityCategory {
  for (const entry of ACTIVITY_TERMS) {
    if (matchAny(normalizedKeyword, entry.terms).length > 0) {
      return entry.value;
    }
  }
  if (matchAny(normalizedKeyword, ["excursion", "экскурс", "tour", "тур"]).length > 0) {
    return "sightseeing";
  }
  return "other";
}

export interface CommercialIntent {
  score: number; // 0-100
  level: CommercialIntentLevel;
  matchedTerms: string[];
}

/**
 * Deterministic commercial-intent score for a normalized keyword.
 * Transactional modifiers dominate; activity/excursion phrasing adds a floor.
 */
export function scoreCommercialIntent(normalizedKeyword: string): CommercialIntent {
  const transactional = matchAny(normalizedKeyword, TRANSACTIONAL_TERMS);
  const commercial = matchAny(normalizedKeyword, COMMERCIAL_TERMS);
  const navigational = matchAny(normalizedKeyword, NAVIGATIONAL_TERMS);

  if (navigational.length > 0) {
    return { score: 60, level: "navigational", matchedTerms: navigational };
  }
  if (transactional.length > 0) {
    const score = Math.min(100, 70 + (transactional.length - 1) * 10);
    return { score, level: "transactional", matchedTerms: transactional };
  }
  if (commercial.length > 0) {
    const score = Math.min(69, 50 + (commercial.length - 1) * 5);
    return { score, level: "commercial", matchedTerms: commercial };
  }
  // Excursion/tour phrasing still implies some buying consideration.
  const excursiony = matchAny(normalizedKeyword, [
    "excursion",
    "экскурс",
    "tour",
    "тур",
    "diving",
    "дайвинг",
    "safari",
    "сафари",
  ]);
  const score = excursiony.length > 0 ? 35 : 20;
  return { score, level: "informational", matchedTerms: excursiony };
}

export interface SeoKeywordAnalysis {
  normalizedKeyword: string;
  region: MarketRegion;
  destination: string | null;
  activityCategory: ActivityCategory;
  commercialIntent: CommercialIntent;
}

/** Full analysis pipeline for a raw Wordstat keyword. */
export function analyzeSeoKeyword(rawKeyword: string): SeoKeywordAnalysis {
  const normalizedKeyword = normalizeKeyword(rawKeyword);
  const { region, destination } = categorizeDestination(normalizedKeyword);
  return {
    normalizedKeyword,
    region,
    destination,
    activityCategory: categorizeActivity(normalizedKeyword),
    commercialIntent: scoreCommercialIntent(normalizedKeyword),
  };
}

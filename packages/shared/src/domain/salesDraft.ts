/**
 * Sales draft composer (pure, deterministic, bilingual RU/EN).
 *
 * Generates a personalized, concise, non-aggressive reply recommending ONLY
 * verified Tourest tours. Because it is a template filled from verified fields,
 * it structurally cannot invent prices, availability, discounts, or booking
 * URLs: any field that is null/empty is simply omitted.
 *
 * It also includes a clear, low-key disclosure of Tourest's commercial
 * relationship. It NEVER sends anything — it only returns text for a human to
 * review and approve.
 */

export type DraftLanguage = "ru" | "en";

/** Verified tour facts the draft may reference. */
export interface SalesDraftTour {
  title: string;
  destination: string;
  durationHours: number | null;
  durationLabel: string | null;
  priceFrom: number | null;
  currency: string | null;
  url: string | null;
}

export interface SalesDraftInput {
  /** Preferred/detected language of the traveler (only "ru" picks Russian). */
  language: string | null;
  /** What the traveler asked about (for a personalized opening). */
  destination: string | null;
  activity: string | null;
  /** Already-ranked, verified tours (recommend at most these). */
  tours: SalesDraftTour[];
}

export interface SalesDraft {
  language: DraftLanguage;
  subject: string;
  body: string;
}

/** Only an explicit Russian preference selects Russian; everything else EN. */
export function resolveDraftLanguage(language: string | null): DraftLanguage {
  return (language ?? "").toLowerCase().trim().startsWith("ru") ? "ru" : "en";
}

function formatPrice(tour: SalesDraftTour): string | null {
  if (tour.priceFrom == null || !tour.currency) return null;
  return `${tour.priceFrom} ${tour.currency}`;
}

function formatDuration(tour: SalesDraftTour, lang: DraftLanguage): string | null {
  if (tour.durationHours != null) {
    return lang === "ru" ? `~${tour.durationHours} ч.` : `~${tour.durationHours}h`;
  }
  if (tour.durationLabel) return tour.durationLabel;
  return null;
}

function tourLines(tour: SalesDraftTour, index: number, lang: DraftLanguage): string {
  const bits: string[] = [];
  const duration = formatDuration(tour, lang);
  const price = formatPrice(tour);

  if (lang === "ru") {
    if (duration) bits.push(`длительность ${duration}`);
    // Price ONLY when both amount and currency are verified.
    if (price) bits.push(`цена от ${price}`);
  } else {
    if (duration) bits.push(`duration ${duration}`);
    if (price) bits.push(`from ${price}`);
  }

  const detail = bits.length > 0 ? ` (${bits.join(", ")})` : "";
  const bookLabel = lang === "ru" ? "Забронировать" : "Book";
  // Booking link ONLY when a verified URL exists.
  const link = tour.url ? `\n   ${bookLabel}: ${tour.url}` : "";
  return `${index + 1}. ${tour.title} — ${tour.destination}${detail}${link}`;
}

export function composeSalesDraft(input: SalesDraftInput): SalesDraft {
  const lang = resolveDraftLanguage(input.language);
  const tours = input.tours.slice(0, 3);
  const destination = input.destination?.trim() || null;
  const activity = input.activity?.trim() || null;

  if (lang === "ru") {
    return composeRu({ destination, activity, tours });
  }
  return composeEn({ destination, activity, tours });
}

function composeRu(args: {
  destination: string | null;
  activity: string | null;
  tours: SalesDraftTour[];
}): SalesDraft {
  const { destination, activity, tours } = args;
  const topic = destination
    ? `по направлению ${destination}`
    : "по вашему запросу";
  const subject = destination
    ? `Tourest: экскурсии ${topic}`
    : "Tourest: подходящие экскурсии";

  const lines: string[] = [];
  lines.push("Здравствуйте!");
  lines.push("");

  if (tours.length === 0) {
    lines.push(
      `Спасибо за интерес к отдыху ${topic}. Пока не нашлось проверенных туров Tourest под ваш запрос — подскажите, пожалуйста, даты и количество участников, и я подберу варианты.`,
    );
  } else {
    const activityPart = activity ? ` (${activity})` : "";
    lines.push(
      `Спасибо за интерес к отдыху ${topic}${activityPart}. Вот подходящие проверенные варианты от Tourest:`,
    );
    lines.push("");
    tours.forEach((t, i) => lines.push(tourLines(t, i, "ru")));
    lines.push("");
    lines.push(
      "Если подскажете даты и число участников, помогу выбрать точнее.",
    );
  }

  lines.push("");
  lines.push(
    "Небольшое уточнение: я представляю Tourest — маркетплейс экскурсий, поэтому рекомендую туры с нашей платформы.",
  );
  lines.push("Хорошего дня!");

  return { language: "ru", subject, body: lines.join("\n") };
}

function composeEn(args: {
  destination: string | null;
  activity: string | null;
  tours: SalesDraftTour[];
}): SalesDraft {
  const { destination, activity, tours } = args;
  const topic = destination ? `in ${destination}` : "for your request";
  const subject = destination
    ? `Tourest: tours ${topic}`
    : "Tourest: tour suggestions";

  const lines: string[] = [];
  lines.push("Hello!");
  lines.push("");

  if (tours.length === 0) {
    lines.push(
      `Thanks for your interest in visiting ${destination ?? "the area"}. I couldn't find a verified Tourest tour matching your request yet — if you share your dates and group size, I'll look again.`,
    );
  } else {
    const activityPart = activity ? ` (${activity})` : "";
    lines.push(
      `Thanks for your interest in things to do ${topic}${activityPart}. Here are some relevant, verified options from Tourest:`,
    );
    lines.push("");
    tours.forEach((t, i) => lines.push(tourLines(t, i, "en")));
    lines.push("");
    lines.push("If you share your dates and group size, I can narrow it down.");
  }

  lines.push("");
  lines.push(
    "Quick note: I'm with Tourest, a tours & activities marketplace, so I recommend tours from our platform.",
  );
  lines.push("Have a great day!");

  return { language: "en", subject, body: lines.join("\n") };
}

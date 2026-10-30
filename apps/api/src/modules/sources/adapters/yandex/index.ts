import { z } from "zod";
import { parseCsvRecords } from "../../../../core/csv";

/**
 * Yandex Wordstat adapter — CSV import ONLY.
 *
 * COMPLIANCE: We do NOT assume a free, unrestricted Wordstat API exists. The
 * only supported ingestion path is a CSV export of keyword demand. Wordstat
 * records are AGGREGATE demand signals, not individual leads, so they are
 * stored in the separate SEOOpportunity model (see modules/seo).
 */

export const yandexConfigSchema = z.object({
  /** Default reporting period label applied to imported rows (e.g. "2026-10"). */
  period: z.string().max(20).optional(),
  defaultLanguage: z.string().max(16).default("ru"),
});
export type YandexConfig = z.infer<typeof yandexConfigSchema>;

/** A raw keyword-demand record parsed from a Wordstat CSV export. */
export interface RawSeoRecord {
  keyword: string;
  demand: number | null;
  language: string | null;
  period: string | null;
}

// Accepted header aliases (normalized to snake_case by the CSV parser).
const KEYWORD_HEADERS = ["keyword", "phrase", "фраза", "query", "запрос"];
const DEMAND_HEADERS = [
  "shows",
  "demand",
  "frequency",
  "показов",
  "показов_в_месяц",
  "частота",
  "count",
];

function pick(record: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (record[k] !== undefined && record[k] !== "") return record[k];
  }
  return undefined;
}

function parseDemand(raw: string | undefined): number | null {
  if (!raw) return null;
  // Wordstat shows may contain spaces/non-breaking spaces as thousands seps.
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

/** Parse a Wordstat CSV export into raw keyword-demand records. */
export function parseWordstatCsv(
  csv: string,
  config: YandexConfig,
): RawSeoRecord[] {
  const records = parseCsvRecords(csv);
  const out: RawSeoRecord[] = [];
  for (const rec of records) {
    const keyword = pick(rec, KEYWORD_HEADERS)?.trim();
    if (!keyword) continue;
    out.push({
      keyword,
      demand: parseDemand(pick(rec, DEMAND_HEADERS)),
      language: config.defaultLanguage ?? null,
      period: config.period ?? null,
    });
  }
  return out;
}

export function parseYandexConfig(config: unknown): YandexConfig {
  return yandexConfigSchema.parse(config ?? {});
}

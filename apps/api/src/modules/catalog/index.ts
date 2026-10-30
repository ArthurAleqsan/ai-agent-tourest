import { desc, eq } from "drizzle-orm";
import {
  rawTourRecordSchema,
  type RawTourRecord,
} from "@tourest/shared";
import { AppError } from "../../core/errors";
import { parseCsvRecords } from "../../core/csv";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  tours,
  type NewTourRow,
  type TourRow,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";

/**
 * Tour catalog module.
 *
 * Imports a REAL Tourest tour catalog via one of three provider kinds:
 *   - an explicitly configured authorized API endpoint (operator-provided),
 *   - a CSV export, or
 *   - a JSON export.
 *
 * We do NOT invent Tourest API endpoints or auth details: the HTTP provider
 * only works when an endpoint is explicitly configured; otherwise a clearly
 * failing "not configured" provider is used. Only verified fields are stored;
 * anything missing stays null (never fabricated).
 */

// ---------------------------------------------------------------------------
// Provider abstraction
// ---------------------------------------------------------------------------

/** A source of raw tour candidate records (validated by the service). */
export interface TourCatalogProvider {
  readonly kind: string;
  fetchCatalog(): Promise<unknown[]>;
}

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface HttpTourCatalogConfig {
  /** Explicitly configured, authorized endpoint. Required. */
  url: string;
  /** Raw auth token value (operator supplies any scheme, e.g. "Bearer x"). */
  token?: string;
  /** Header to carry the token (default "Authorization"). */
  headerName?: string;
}

/**
 * Authorized HTTP catalog provider. The endpoint + auth are supplied by the
 * operator via configuration — nothing is assumed or invented here.
 */
export class HttpTourCatalogProvider implements TourCatalogProvider {
  readonly kind = "http";
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: HttpTourCatalogConfig,
    fetchImpl?: FetchLike,
  ) {
    if (!config.url || config.url.trim().length === 0) {
      throw new AppError(
        "Tour catalog API endpoint is not configured",
        400,
        "CATALOG_NOT_CONFIGURED",
      );
    }
    this.fetchImpl = fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async fetchCatalog(): Promise<unknown[]> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.token) {
      headers[this.config.headerName ?? "Authorization"] = this.config.token;
    }
    const res = await this.fetchImpl(this.config.url, { method: "GET", headers });
    if (!res.ok) {
      throw new AppError(
        `Tour catalog endpoint returned HTTP ${res.status}`,
        502,
        "CATALOG_FETCH_FAILED",
      );
    }
    const body = await res.json();
    return coerceCatalogArray(body);
  }
}

/** Placeholder used until an authorized endpoint is explicitly configured. */
export class NotConfiguredTourCatalogProvider implements TourCatalogProvider {
  readonly kind = "not_configured";
  async fetchCatalog(): Promise<unknown[]> {
    throw new AppError(
      "No authorized Tourest catalog endpoint configured. Set TOUR_CATALOG_API_URL " +
        "or import a CSV/JSON export instead.",
      400,
      "CATALOG_NOT_CONFIGURED",
    );
  }
}

export class CsvTourCatalogProvider implements TourCatalogProvider {
  readonly kind = "csv";
  constructor(private readonly csv: string) {}
  async fetchCatalog(): Promise<unknown[]> {
    return parseTourCsv(this.csv);
  }
}

export class JsonTourCatalogProvider implements TourCatalogProvider {
  readonly kind = "json";
  constructor(private readonly json: string) {}
  async fetchCatalog(): Promise<unknown[]> {
    return parseTourJson(this.json);
  }
}

// ---------------------------------------------------------------------------
// Parsers (CSV / JSON exports -> raw candidate objects)
// ---------------------------------------------------------------------------

function str(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : undefined;
}
function num(v: string | undefined): number | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
function list(v: string | undefined): string[] | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  return t
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function jsonObj(v: string | undefined): Record<string, unknown> | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Parse a tour CSV export into raw candidate objects (not yet validated). */
export function parseTourCsv(csv: string): unknown[] {
  return parseCsvRecords(csv).map((rec) => ({
    externalId: str(rec.external_id ?? rec.id ?? rec.tour_id),
    title: str(rec.title ?? rec.name),
    destination: str(rec.destination),
    country: str(rec.country),
    category: str(rec.category) ?? null,
    description: str(rec.description) ?? null,
    durationHours: num(rec.duration_hours) ?? null,
    durationLabel: str(rec.duration_label ?? rec.duration) ?? null,
    languages: list(rec.languages) ?? [],
    priceFrom: num(rec.price_from ?? rec.price) ?? null,
    currency: str(rec.currency)?.toUpperCase() ?? null,
    url: str(rec.url ?? rec.booking_url) ?? null,
    availability: jsonObj(rec.availability) ?? null,
  }));
}

/** Parse a tour JSON export (array or `{ tours: [...] }`) into candidates. */
export function parseTourJson(json: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new AppError(
      `Invalid tour catalog JSON: ${err instanceof Error ? err.message : String(err)}`,
      400,
      "CATALOG_BAD_JSON",
    );
  }
  return coerceCatalogArray(parsed).map(normalizeJsonCandidate);
}

function coerceCatalogArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const maybe = (body as Record<string, unknown>).tours;
    if (Array.isArray(maybe)) return maybe;
    const data = (body as Record<string, unknown>).data;
    if (Array.isArray(data)) return data;
  }
  throw new AppError(
    "Tour catalog payload must be an array or { tours: [...] }",
    400,
    "CATALOG_BAD_SHAPE",
  );
}

/** Accept common snake_case aliases in JSON exports. */
function normalizeJsonCandidate(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const o = input as Record<string, unknown>;
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) if (o[k] !== undefined) return o[k];
    return undefined;
  };
  return {
    externalId: pick("externalId", "external_id", "id", "tourId", "tour_id"),
    title: pick("title", "name"),
    destination: pick("destination"),
    country: pick("country"),
    category: pick("category") ?? null,
    description: pick("description") ?? null,
    durationHours: pick("durationHours", "duration_hours") ?? null,
    durationLabel: pick("durationLabel", "duration_label", "duration") ?? null,
    languages: pick("languages") ?? [],
    priceFrom: pick("priceFrom", "price_from", "price") ?? null,
    currency: pick("currency") ?? null,
    url: pick("url", "bookingUrl", "booking_url") ?? null,
    availability: pick("availability") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface TourRepository {
  upsertByExternalId(
    rec: RawTourRecord,
    syncedAt: string,
  ): Promise<{ row: TourRow; created: boolean }>;
  list(limit?: number): Promise<TourRow[]>;
  listActive(limit?: number): Promise<TourRow[]>;
  findById(id: string): Promise<TourRow | null>;
  findByExternalId(externalId: string): Promise<TourRow | null>;
}

export class DrizzleTourRepository implements TourRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByExternalId(externalId: string): Promise<TourRow | null> {
    const [row] = await this.db
      .select()
      .from(tours)
      .where(eq(tours.externalId, externalId));
    return row ?? null;
  }

  async findById(id: string): Promise<TourRow | null> {
    const [row] = await this.db.select().from(tours).where(eq(tours.id, id));
    return row ?? null;
  }

  async upsertByExternalId(
    rec: RawTourRecord,
    syncedAt: string,
  ): Promise<{ row: TourRow; created: boolean }> {
    const fields = {
      externalId: rec.externalId,
      title: rec.title,
      destination: rec.destination,
      country: rec.country,
      category: rec.category ?? null,
      description: rec.description ?? null,
      durationHours: rec.durationHours ?? null,
      durationLabel: rec.durationLabel ?? null,
      languages: rec.languages ?? [],
      priceFrom: rec.priceFrom ?? null,
      currency: rec.currency ?? null,
      url: rec.url ?? null,
      availability: rec.availability ?? null,
      lastSyncedAt: syncedAt,
      isActive: true,
    };

    const existing = await this.findByExternalId(rec.externalId);
    if (existing) {
      const [row] = await this.db
        .update(tours)
        .set({ ...fields, updatedAt: new Date().toISOString() })
        .where(eq(tours.id, existing.id))
        .returning();
      return { row: row as TourRow, created: false };
    }
    const values: NewTourRow = fields;
    const [row] = await this.db.insert(tours).values(values).returning();
    return { row: row as TourRow, created: true };
  }

  async list(limit = 200): Promise<TourRow[]> {
    return this.db.select().from(tours).orderBy(desc(tours.updatedAt)).limit(limit);
  }

  async listActive(limit = 500): Promise<TourRow[]> {
    const rows = await this.db
      .select()
      .from(tours)
      .where(eq(tours.isActive, true))
      .limit(limit);
    return rows;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface TourImportSummary {
  received: number;
  created: number;
  updated: number;
  invalid: number;
  errors: string[];
  syncedAt: string;
}

export interface TourCatalogService {
  importCandidates(candidates: unknown[]): Promise<TourImportSummary>;
  importFromCsv(csv: string): Promise<TourImportSummary>;
  importFromJson(json: string): Promise<TourImportSummary>;
  sync(provider: TourCatalogProvider): Promise<TourImportSummary>;
}

export class CatalogService implements TourCatalogService {
  constructor(
    private readonly tourRepo: TourRepository,
    private readonly activityLog: ActivityLogRepository,
    private readonly logger: Logger,
  ) {}

  async importCandidates(candidates: unknown[]): Promise<TourImportSummary> {
    const syncedAt = new Date().toISOString();
    const summary: TourImportSummary = {
      received: candidates.length,
      created: 0,
      updated: 0,
      invalid: 0,
      errors: [],
      syncedAt,
    };

    for (const candidate of candidates) {
      const parsed = rawTourRecordSchema.safeParse(candidate);
      if (!parsed.success) {
        summary.invalid += 1;
        continue;
      }
      try {
        const { created } = await this.tourRepo.upsertByExternalId(
          parsed.data,
          syncedAt,
        );
        if (created) summary.created += 1;
        else summary.updated += 1;
      } catch (err) {
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    await this.activityLog.append({
      entityType: "tour_catalog",
      entityId: null,
      action: "catalog.imported",
      actor: "system",
      metadata: {
        received: summary.received,
        created: summary.created,
        updated: summary.updated,
        invalid: summary.invalid,
      },
    });
    this.logger.info("tour catalog import complete", {
      ...summary,
      errors: summary.errors.length,
    });
    return summary;
  }

  importFromCsv(csv: string): Promise<TourImportSummary> {
    return this.importCandidates(parseTourCsv(csv));
  }

  importFromJson(json: string): Promise<TourImportSummary> {
    return this.importCandidates(parseTourJson(json));
  }

  async sync(provider: TourCatalogProvider): Promise<TourImportSummary> {
    const candidates = await provider.fetchCatalog();
    this.logger.info("tour catalog sync fetched", {
      provider: provider.kind,
      records: candidates.length,
    });
    return this.importCandidates(candidates);
  }
}

export function createTourCatalogService(
  tourRepo: TourRepository,
  activityLog: ActivityLogRepository,
  logger: Logger,
): TourCatalogService {
  return new CatalogService(tourRepo, activityLog, logger);
}

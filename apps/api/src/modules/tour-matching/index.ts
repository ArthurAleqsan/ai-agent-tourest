import { desc, eq } from "drizzle-orm";
import {
  categorizeDestination,
  matchTours,
  type MarketRegion,
  type MatchableTour,
  type RankedTour,
  type TravelRequest,
} from "@tourest/shared";
import { NotFoundError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  tourMatches,
  tours,
  type NewTourMatchRow,
  type QualificationRow,
  type TourMatchRow,
  type TourRow,
} from "../../db/schema";
import type { TourRepository } from "../catalog/index";
import type { QualificationRepository } from "../qualification/index";

/**
 * Tour-matching module.
 *
 * Turns a qualified request (a Qualification) into up to three ranked,
 * verified Tourest tours with explanations. The ranking logic itself lives in
 * the pure, dependency-free `matchTours` domain function; this layer loads the
 * catalog, runs it, and optionally persists the results.
 */

/** Map a stored tour row to the matcher's verified-fields view. */
export function toMatchableTour(row: TourRow): MatchableTour {
  return {
    id: row.id,
    externalId: row.externalId,
    title: row.title,
    destination: row.destination,
    country: row.country,
    category: row.category,
    description: row.description,
    languages: row.languages ?? [],
    durationHours: row.durationHours,
    durationLabel: row.durationLabel,
    priceFrom: row.priceFrom,
    currency: row.currency,
    url: row.url,
    availability: row.availability ?? null,
    isActive: row.isActive,
  };
}

/** Build a TravelRequest from a stored qualification (facts only). */
export function buildTravelRequest(q: QualificationRow): TravelRequest {
  const hint = `${q.destination ?? ""} ${q.city ?? ""}`.trim();
  let region: MarketRegion | null = null;
  if (hint.length > 0) {
    const derived = categorizeDestination(hint.toLowerCase());
    region = derived.region === "other" ? null : derived.region;
  }
  return {
    destination: q.destination,
    city: q.city,
    region,
    activityCategory: q.activityCategory,
    travelDates: q.travelDates,
    travelersCount: q.travelersCount,
    language: q.language,
  };
}

export interface MatchForItemOptions {
  limit?: number;
  /** Persist results into tour_matches (default true). */
  persist?: boolean;
}

export interface TourMatchingService {
  matchRequest(request: TravelRequest, limit?: number): Promise<RankedTour[]>;
  matchForSourceItem(
    sourceItemId: string,
    options?: MatchForItemOptions,
  ): Promise<RankedTour[]>;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface RecommendationRow {
  match: TourMatchRow;
  tourTitle: string | null;
  tourDestination: string | null;
  tourUrl: string | null;
  tourCategory: string | null;
}

export interface TourMatchRepository {
  replaceForSourceItem(
    sourceItemId: string,
    ranked: RankedTour[],
  ): Promise<TourMatchRow[]>;
  listBySourceItem(sourceItemId: string): Promise<TourMatchRow[]>;
  listRecent(limit?: number): Promise<RecommendationRow[]>;
  findById(id: string): Promise<TourMatchRow | null>;
}

export class DrizzleTourMatchRepository implements TourMatchRepository {
  constructor(private readonly db: AppDatabase) {}

  async replaceForSourceItem(
    sourceItemId: string,
    ranked: RankedTour[],
  ): Promise<TourMatchRow[]> {
    await this.db
      .delete(tourMatches)
      .where(eq(tourMatches.sourceItemId, sourceItemId));

    if (ranked.length === 0) return [];

    const values: NewTourMatchRow[] = ranked.map((r, index) => ({
      leadId: null,
      sourceItemId,
      tourId: r.tour.id,
      score: r.scoreNormalized,
      rank: index,
      matchedOn: r.matchedOn,
      rationale: r.rationale,
    }));
    return this.db.insert(tourMatches).values(values).returning();
  }

  async listBySourceItem(sourceItemId: string): Promise<TourMatchRow[]> {
    return this.db
      .select()
      .from(tourMatches)
      .where(eq(tourMatches.sourceItemId, sourceItemId))
      .orderBy(tourMatches.rank);
  }

  async listRecent(limit = 100): Promise<RecommendationRow[]> {
    const rows = await this.db
      .select({ match: tourMatches, tour: tours })
      .from(tourMatches)
      .leftJoin(tours, eq(tours.id, tourMatches.tourId))
      .orderBy(desc(tourMatches.createdAt))
      .limit(limit);
    return rows.map(({ match, tour }) => ({
      match,
      tourTitle: tour?.title ?? null,
      tourDestination: tour?.destination ?? null,
      tourUrl: tour?.url ?? null,
      tourCategory: tour?.category ?? null,
    }));
  }

  async findById(id: string): Promise<TourMatchRow | null> {
    const [row] = await this.db
      .select()
      .from(tourMatches)
      .where(eq(tourMatches.id, id));
    return row ?? null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface TourMatchingServiceDeps {
  tourRepo: TourRepository;
  qualificationRepo: QualificationRepository;
  tourMatchRepo: TourMatchRepository;
  logger: Logger;
}

export class LocalTourMatchingService implements TourMatchingService {
  constructor(private readonly deps: TourMatchingServiceDeps) {}

  async matchRequest(
    request: TravelRequest,
    limit = 3,
  ): Promise<RankedTour[]> {
    const rows = await this.deps.tourRepo.listActive();
    const matchable = rows.map(toMatchableTour);
    return matchTours(request, matchable, { limit });
  }

  async matchForSourceItem(
    sourceItemId: string,
    options: MatchForItemOptions = {},
  ): Promise<RankedTour[]> {
    const q =
      await this.deps.qualificationRepo.findBySourceItemId(sourceItemId);
    if (!q) {
      throw new NotFoundError(`Qualification for source item ${sourceItemId}`);
    }
    const request = buildTravelRequest(q);
    const ranked = await this.matchRequest(request, options.limit ?? 3);

    if (options.persist !== false) {
      await this.deps.tourMatchRepo.replaceForSourceItem(sourceItemId, ranked);
    }
    this.deps.logger.info("tour matching complete", {
      sourceItemId,
      matches: ranked.length,
    });
    return ranked;
  }
}

export function createTourMatchingService(
  deps: TourMatchingServiceDeps,
): TourMatchingService {
  return new LocalTourMatchingService(deps);
}

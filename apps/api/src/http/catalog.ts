import { Router } from "express";
import { z } from "zod";
import type { AppContainer } from "../core/di/container";
import { NotFoundError, ValidationError } from "../core/errors";
import {
  CsvTourCatalogProvider,
  JsonTourCatalogProvider,
} from "../modules/catalog/index";
import { asyncHandler } from "./asyncHandler";

/**
 * Tour catalog + matching routes.
 *  - Import a catalog via CSV/JSON body or sync from the configured provider.
 *  - List/inspect verified tours.
 *  - Match up to three verified tours for a qualified source item.
 */

const importSchema = z
  .object({
    csv: z.string().min(1).optional(),
    json: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.csv) || Boolean(v.json), {
    message: "Provide either `csv` or `json`",
  });

const matchQuerySchema = z
  .object({ limit: z.coerce.number().int().positive().max(10).optional() })
  .optional();

export function createCatalogRouter(container: AppContainer): Router {
  const router = Router();
  const { tourCatalogService, tourCatalogProvider, tourRepository, tourMatchingService, tourMatchRepository } =
    container;

  // Import a catalog from a CSV or JSON export body.
  router.post(
    "/catalog/import",
    asyncHandler(async (req, res) => {
      const input = importSchema.parse(req.body);
      const summary = input.csv
        ? await tourCatalogService.sync(new CsvTourCatalogProvider(input.csv))
        : await tourCatalogService.sync(
            new JsonTourCatalogProvider(input.json as string),
          );
      res.json(summary);
    }),
  );

  // Sync from the explicitly configured authorized provider (if any).
  router.post(
    "/catalog/sync",
    asyncHandler(async (_req, res) => {
      const summary = await tourCatalogService.sync(tourCatalogProvider);
      res.json(summary);
    }),
  );

  router.get(
    "/tours",
    asyncHandler(async (_req, res) => {
      res.json(await tourRepository.list());
    }),
  );

  router.get(
    "/tours/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const tour = await tourRepository.findById(id);
      if (!tour) throw new NotFoundError(`Tour ${id}`);
      res.json(tour);
    }),
  );

  // Match verified tours for a qualified source item (persists tour_matches).
  router.post(
    "/source-items/:id/match",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const query = matchQuerySchema.parse(req.query);
      const ranked = await tourMatchingService.matchForSourceItem(id, {
        limit: query?.limit ?? 3,
        persist: true,
      });
      res.json({
        sourceItemId: id,
        matches: ranked.map((r) => ({
          tourId: r.tour.id,
          title: r.tour.title,
          destination: r.tour.destination,
          score: r.scoreNormalized,
          matchedOn: r.matchedOn,
          rationale: r.rationale,
        })),
      });
    }),
  );

  router.get(
    "/source-items/:id/matches",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(await tourMatchRepository.listBySourceItem(id));
    }),
  );

  // Surface a clear error if someone imports an empty payload by mistake.
  router.post(
    "/catalog/import/validate",
    asyncHandler(async (req, res) => {
      const input = importSchema.safeParse(req.body);
      if (!input.success) {
        throw new ValidationError("invalid import payload", input.error.issues);
      }
      res.json({ ok: true });
    }),
  );

  return router;
}

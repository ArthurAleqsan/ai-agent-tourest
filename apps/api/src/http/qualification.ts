import { Router } from "express";
import { z } from "zod";
import { ACCESS_PERMISSION_STATUSES } from "@tourest/shared";
import type { AppContainer } from "../core/di/container";
import { NotFoundError } from "../core/errors";
import { asyncHandler } from "./asyncHandler";

/**
 * Routes for manually importing source items and running AI qualification.
 * Nothing here sends messages; qualification is analysis only.
 */

const createSourceItemSchema = z.object({
  rawContent: z.string().min(1).max(20000),
  url: z.string().url().nullable().optional(),
  externalId: z.string().max(512).nullable().optional(),
  language: z.string().max(16).nullable().optional(),
  isAuthorizedMessage: z.boolean().optional(),
  accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES).optional(),
});

const qualifyBodySchema = z
  .object({ force: z.boolean().optional() })
  .optional();

const runBatchSchema = z
  .object({ limit: z.number().int().positive().max(200).optional() })
  .optional();

export function createQualificationRouter(container: AppContainer): Router {
  const router = Router();
  const {
    sourceRepository,
    sourceItemRepository,
    qualificationRepository,
    qualificationService,
  } = container;

  router.get(
    "/source-items",
    asyncHandler(async (req, res) => {
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : 100;
      const items = await sourceItemRepository.listRecent(
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100,
      );
      res.json(items);
    }),
  );

  // Import a source item manually (human-provided public content / message).
  router.post(
    "/source-items",
    asyncHandler(async (req, res) => {
      const input = createSourceItemSchema.parse(req.body);
      const source = await sourceRepository.ensureManualSource();
      const { item } = await sourceItemRepository.create({
        sourceId: source.id,
        rawContent: input.rawContent,
        url: input.url ?? null,
        externalId: input.externalId ?? null,
        language: input.language ?? null,
        isAuthorizedMessage: input.isAuthorizedMessage ?? false,
        ...(input.accessPermissionStatus
          ? { accessPermissionStatus: input.accessPermissionStatus }
          : {}),
      });
      res.status(201).json(item);
    }),
  );

  router.get(
    "/source-items/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const item = await sourceItemRepository.findById(id);
      if (!item) throw new NotFoundError(`SourceItem ${id}`);
      res.json(item);
    }),
  );

  // Qualify a single source item (idempotent unless force=true).
  router.post(
    "/source-items/:id/qualify",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const body = qualifyBodySchema.parse(req.body);
      const force = body?.force ?? req.query.force === "true";
      const qualification = await qualificationService.qualifySourceItem(id, {
        force,
      });
      res.json(qualification);
    }),
  );

  router.get(
    "/source-items/:id/qualification",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const q = await qualificationRepository.findBySourceItemId(id);
      if (!q) throw new NotFoundError(`Qualification for item ${id}`);
      res.json(q);
    }),
  );

  // Batch: analyze all currently unqualified source items.
  router.post(
    "/qualify/run",
    asyncHandler(async (req, res) => {
      const body = runBatchSchema.parse(req.body);
      const result = await qualificationService.qualifyPending(body?.limit);
      res.json(result);
    }),
  );

  router.get(
    "/qualifications",
    asyncHandler(async (_req, res) => {
      const rows = await qualificationRepository.list();
      res.json(rows);
    }),
  );

  return router;
}

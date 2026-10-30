import { Router } from "express";
import { z } from "zod";
import {
  JOB_NAMES,
  LEAD_PIPELINE_STATUSES,
  MARKET_REGIONS,
} from "@tourest/shared";
import { env } from "../config/env";
import type { AppContainer } from "../core/di/container";
import { NotFoundError, ValidationError } from "../core/errors";
import { asyncHandler } from "./asyncHandler";

const leadQuerySchema = z.object({
  query: z.string().max(200).optional(),
  status: z.enum(LEAD_PIPELINE_STATUSES).optional(),
  region: z.enum(MARKET_REGIONS).optional(),
  sourceId: z.string().min(1).optional(),
  destination: z.string().max(200).optional(),
  sortBy: z.enum(["intent", "created"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

const promoteSchema = z.object({
  sourceItemId: z.string().min(1),
  displayName: z.string().max(200).nullable().optional(),
  contactHandle: z.string().max(320).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(LEAD_PIPELINE_STATUSES),
});

const notesSchema = z.object({
  notes: z.string().max(5000).nullable(),
});

const overrideSchema = z.object({
  manualIntentScore: z.number().int().min(0).max(100),
  reason: z.string().max(1000).nullable().optional(),
});

const jobConfigSchema = z.object({
  enabled: z.boolean().optional(),
  schedule: z.string().min(1).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  concurrencyLimit: z.number().int().positive().max(8).optional(),
});

const suppressSchema = z.object({
  value: z.string().min(1).max(320),
  reason: z.string().max(500).nullable().optional(),
  createdBy: z.string().max(200).nullable().optional(),
});

/**
 * Dashboard API: leads, analytics, jobs, privacy, activity, settings.
 * None of these endpoints send outbound messages.
 */
export function createDashboardRouter(container: AppContainer): Router {
  const router = Router();
  const {
    leadService,
    analyticsService,
    jobScheduler,
    activityLogRepository,
    contactSuppressionService,
    dataDeletionService,
    tourMatchRepository,
    authService,
  } = container;

  // --- Leads ---
  router.get(
    "/leads",
    asyncHandler(async (req, res) => {
      const filter = leadQuerySchema.parse(req.query);
      res.json(await leadService.list(filter));
    }),
  );

  router.get(
    "/leads/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(await leadService.getById(id));
    }),
  );

  router.post(
    "/leads",
    asyncHandler(async (req, res) => {
      const input = promoteSchema.parse(req.body);
      const result = await leadService.promoteFromSourceItem(input);
      res.status(result.created ? 201 : 200).json(result);
    }),
  );

  router.post(
    "/leads/:id/status",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const { status } = statusSchema.parse(req.body);
      res.json(await leadService.updateStatus(id, status, "human"));
    }),
  );

  router.patch(
    "/leads/:id/notes",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const { notes } = notesSchema.parse(req.body);
      res.json(await leadService.setNotes(id, notes));
    }),
  );

  router.post(
    "/leads/:id/override",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const { manualIntentScore, reason } = overrideSchema.parse(req.body);
      res.json(
        await leadService.overrideQualification(
          id,
          manualIntentScore,
          reason ?? null,
        ),
      );
    }),
  );

  router.delete(
    "/leads/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const ok = await dataDeletionService.deleteLead(id);
      if (!ok) throw new NotFoundError(`Lead ${id}`);
      res.json({ ok: true });
    }),
  );

  // --- Analytics (confirmed data only) ---
  router.get(
    "/analytics",
    asyncHandler(async (_req, res) => {
      res.json(await analyticsService.overview());
    }),
  );

  // --- AI recommendations (verified tour matches) ---
  router.get(
    "/recommendations",
    asyncHandler(async (_req, res) => {
      res.json(await tourMatchRepository.listRecent());
    }),
  );

  // --- Jobs ---
  router.get(
    "/jobs",
    asyncHandler(async (_req, res) => {
      res.json(jobScheduler.list());
    }),
  );

  router.post(
    "/jobs/:name/run",
    asyncHandler(async (req, res) => {
      const name = req.params.name as string;
      try {
        res.json(await jobScheduler.runNow(name));
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Unknown job")) {
          throw new NotFoundError(`Job ${name}`);
        }
        throw err;
      }
    }),
  );

  router.post(
    "/jobs/:name/pause",
    asyncHandler(async (req, res) => {
      const name = req.params.name as string;
      try {
        jobScheduler.pause(name);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Unknown job")) {
          throw new NotFoundError(`Job ${name}`);
        }
        throw err;
      }
      res.json(jobScheduler.list().find((j) => j.name === name));
    }),
  );

  router.post(
    "/jobs/:name/resume",
    asyncHandler(async (req, res) => {
      const name = req.params.name as string;
      try {
        jobScheduler.resume(name);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Unknown job")) {
          throw new NotFoundError(`Job ${name}`);
        }
        throw err;
      }
      res.json(jobScheduler.list().find((j) => j.name === name));
    }),
  );

  router.patch(
    "/jobs/:name",
    asyncHandler(async (req, res) => {
      const name = z.enum(JOB_NAMES).parse(req.params.name);
      const patch = jobConfigSchema.parse(req.body);
      try {
        res.json(jobScheduler.setConfig(name, patch));
      } catch (err) {
        if (err instanceof Error && err.message.includes("Invalid cron")) {
          throw new ValidationError(err.message);
        }
        throw err;
      }
    }),
  );

  // --- Activity / audit log ---
  router.get(
    "/activity",
    asyncHandler(async (_req, res) => {
      res.json(await activityLogRepository.recent(200));
    }),
  );

  // --- Privacy: contact suppression + deletion ---
  router.get(
    "/suppressions",
    asyncHandler(async (_req, res) => {
      res.json(await contactSuppressionService.list());
    }),
  );

  router.post(
    "/suppressions",
    asyncHandler(async (req, res) => {
      const input = suppressSchema.parse(req.body);
      const row = await contactSuppressionService.suppress(input);
      res.status(201).json(row);
    }),
  );

  router.delete(
    "/suppressions/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const ok = await contactSuppressionService.remove(id);
      if (!ok) throw new NotFoundError(`Suppression ${id}`);
      res.json({ ok: true });
    }),
  );

  router.delete(
    "/source-items/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const ok = await dataDeletionService.deleteSourceItem(id);
      if (!ok) throw new NotFoundError(`SourceItem ${id}`);
      res.json({ ok: true });
    }),
  );

  router.post(
    "/privacy/purge",
    asyncHandler(async (_req, res) => {
      res.json(await dataDeletionService.purgeExpired());
    }),
  );

  // --- Settings (non-secret configuration only) ---
  router.get(
    "/settings",
    asyncHandler(async (_req, res) => {
      res.json({
        authEnabled: authService.enabled,
        ollamaModel: env.OLLAMA_MODEL,
        ollamaBaseUrl: env.OLLAMA_BASE_URL,
        catalogConfigured: env.TOUR_CATALOG_API_URL.length > 0,
        telegramConfigured: env.TELEGRAM_BOT_TOKEN.length > 0,
        jobsDisabled: env.JOBS_DISABLED.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        nodeEnv: env.NODE_ENV,
        followUpDays: 3,
      });
    }),
  );

  return router;
}

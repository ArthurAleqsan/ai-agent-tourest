import { Router } from "express";
import { z } from "zod";
import { ACCESS_PERMISSION_STATUSES, SOURCE_TYPES } from "@tourest/shared";
import type { AppContainer } from "../core/di/container";
import { NotFoundError, ValidationError } from "../core/errors";
import { env } from "../config/env";
import {
  telegramConfigSchema,
  telegramUpdatesToRecords,
  type TelegramUpdate,
} from "../modules/sources/adapters/telegram/index";
import { asyncHandler } from "./asyncHandler";

const createSourceSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(SOURCE_TYPES),
  url: z.string().url().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES).optional(),
  isEnabled: z.boolean().optional(),
  retentionDays: z.number().int().positive().max(3650).optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES).optional(),
  isEnabled: z.boolean().optional(),
  retentionDays: z.number().int().positive().max(3650).optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

const csvBodySchema = z.object({ csv: z.string().min(1) });

/**
 * Source management + manual ingestion triggers + Telegram webhook + SEO
 * opportunities + job-run history. No endpoint ever sends outbound messages.
 */
export function createIngestionRouter(container: AppContainer): Router {
  const router = Router();
  const {
    sourceRepository,
    ingestionCoordinator,
    seoService,
    seoOpportunityRepository,
    ingestionService,
    jobRunRepository,
    jobScheduler,
  } = container;

  // --- Source management (enable/disable, config) ---
  router.get(
    "/sources",
    asyncHandler(async (_req, res) => {
      res.json(await sourceRepository.list());
    }),
  );

  router.post(
    "/sources",
    asyncHandler(async (req, res) => {
      const input = createSourceSchema.parse(req.body);
      const source = await sourceRepository.create({
        name: input.name,
        type: input.type,
        url: input.url ?? null,
        description: input.description ?? null,
        ...(input.accessPermissionStatus
          ? { accessPermissionStatus: input.accessPermissionStatus }
          : {}),
        ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
        ...(input.retentionDays !== undefined
          ? { retentionDays: input.retentionDays }
          : {}),
        config: input.config ?? null,
      });
      res.status(201).json(source);
    }),
  );

  router.patch(
    "/sources/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const patch = updateSourceSchema.parse(req.body);
      const updated = await sourceRepository.update(id, patch);
      if (!updated) throw new NotFoundError(`Source ${id}`);
      res.json(updated);
    }),
  );

  // --- Manual ingestion trigger (adapter dispatch by source type) ---
  router.post(
    "/sources/:id/ingest",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const source = await sourceRepository.findById(id);
      if (!source) throw new NotFoundError(`Source ${id}`);

      if (source.type === "yandex_wordstat") {
        const { csv } = csvBodySchema.parse(req.body);
        const summary = await seoService.importWordstatCsv(id, csv);
        res.json({ kind: "seo", ...summary });
        return;
      }

      // Telegram manual trigger polls immediately (ignores body); others use body.
      const input = source.type === "telegram" ? undefined : req.body;
      const summary = await ingestionCoordinator.runManual(id, input);
      res.json({ kind: "ingest", ...summary });
    }),
  );

  // --- Telegram webhook receiver ---
  router.post(
    "/telegram/webhook",
    asyncHandler(async (req, res) => {
      // Optional shared-secret validation (Telegram sets this header).
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const provided = req.header("x-telegram-bot-api-secret-token");
        if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
          throw new ValidationError("invalid Telegram webhook secret");
        }
      }

      const update = req.body as TelegramUpdate;
      const msg = update?.message ?? update?.channel_post;
      if (!msg) {
        res.json({ ok: true, ingested: 0 });
        return;
      }

      // Find the enabled Telegram source whose allowlist admits this chat.
      const sources = await sourceRepository.listEnabledByType("telegram");
      const target = sources.find((s) => {
        const cfg = telegramConfigSchema.parse(s.config ?? {});
        return (
          cfg.monitoredChatIds.length === 0 ||
          cfg.monitoredChatIds.includes(msg.chat.id)
        );
      });
      if (!target) {
        res.json({ ok: true, ingested: 0, reason: "no matching telegram source" });
        return;
      }

      const cfg = telegramConfigSchema.parse(target.config ?? {});
      const records = telegramUpdatesToRecords([update], cfg);
      const summary = await ingestionService.ingestRecords(target.id, records);
      res.json({ ok: true, ...summary });
    }),
  );

  // --- SEO opportunities (aggregate demand signals, not leads) ---
  router.get(
    "/seo-opportunities",
    asyncHandler(async (_req, res) => {
      res.json(await seoOpportunityRepository.list());
    }),
  );

  // --- Job-run history (error logs / observability) ---
  router.get(
    "/job-runs",
    asyncHandler(async (_req, res) => {
      res.json(await jobRunRepository.recent());
    }),
  );

  // --- Manual job trigger (e.g. telegram-poll) ---
  router.post(
    "/jobs/:name/run",
    asyncHandler(async (req, res) => {
      const name = req.params.name as string;
      const result = await jobScheduler.runNow(name);
      res.json(result);
    }),
  );

  return router;
}

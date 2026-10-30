import { Router } from "express";
import { z } from "zod";
import { OUTREACH_CHANNELS } from "@tourest/shared";
import type { AppContainer } from "../core/di/container";
import { asyncHandler } from "./asyncHandler";

/**
 * Sales-draft routes with human-in-the-loop approval.
 *
 * Drafts are created PENDING. Approval does NOT post anything to any platform;
 * a human copies an approved draft and sends it manually. Editing, rejecting,
 * and copying approved drafts are all supported.
 */

const createDraftSchema = z
  .object({
    language: z.string().max(16).optional(),
    channel: z.enum(OUTREACH_CHANNELS).optional(),
    limit: z.number().int().positive().max(10).optional(),
  })
  .optional();

const editDraftSchema = z
  .object({
    subject: z.string().max(300).nullable().optional(),
    body: z.string().min(1).max(10000).optional(),
  })
  .refine((v) => v.subject !== undefined || v.body !== undefined, {
    message: "Provide `subject` and/or `body` to edit",
  });

const approveSchema = z.object({
  approvedBy: z.string().min(1).max(200),
});

const rejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export function createOutreachRouter(container: AppContainer): Router {
  const router = Router();
  const { messageDraftService } = container;

  // Generate a pending sales draft for a qualified source item.
  router.post(
    "/source-items/:id/draft",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const body = createDraftSchema.parse(req.body);
      const draft = await messageDraftService.createForSourceItem({
        sourceItemId: id,
        ...(body?.language ? { language: body.language } : {}),
        ...(body?.channel ? { channel: body.channel } : {}),
        ...(body?.limit ? { limit: body.limit } : {}),
      });
      await container.leadService.markDraftReadyForSourceItem(id);
      res.status(201).json(draft);
    }),
  );

  router.get(
    "/drafts",
    asyncHandler(async (_req, res) => {
      res.json(await messageDraftService.list());
    }),
  );

  router.get(
    "/drafts/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(await messageDraftService.get(id));
    }),
  );

  // Edit a draft (returns it to pending approval).
  router.patch(
    "/drafts/:id",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const patch = editDraftSchema.parse(req.body);
      res.json(await messageDraftService.edit(id, patch));
    }),
  );

  // Approve a draft. Does NOT send/post anything.
  router.post(
    "/drafts/:id/approve",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const { approvedBy } = approveSchema.parse(req.body);
      res.json(await messageDraftService.approve(id, approvedBy));
    }),
  );

  router.post(
    "/drafts/:id/reject",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const { reason } = rejectSchema.parse(req.body);
      res.json(await messageDraftService.reject(id, reason));
    }),
  );

  // Copy an approved draft's text for a human to send manually.
  router.get(
    "/drafts/:id/copy",
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(await messageDraftService.copyApproved(id));
    }),
  );

  return router;
}

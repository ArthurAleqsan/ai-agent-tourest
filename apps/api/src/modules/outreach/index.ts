import { desc, eq } from "drizzle-orm";
import {
  composeSalesDraft,
  type MessageDraft,
  type OutreachChannel as Channel,
  type RankedTour,
  type SalesDraftTour,
} from "@tourest/shared";
import { NotFoundError, NotImplementedError, ValidationError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import {
  messageDrafts,
  type MessageDraftRow,
  type NewMessageDraftRow,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";
import type { QualificationRepository } from "../qualification/index";
import type {
  TourMatchingService,
  TourMatchRepository,
} from "../tour-matching/index";

/**
 * Outreach module — Sales Draft Agent + human approval.
 *
 * Drafting is DETERMINISTIC and template-based (see `composeSalesDraft`), so it
 * structurally cannot invent prices, availability, discounts, or booking URLs:
 * it only fills verified fields from matched Tourest tours. Every draft is
 * created PENDING and must be explicitly approved by a human. Approval does NOT
 * send anything — there is no automatic posting to any third-party platform.
 */

function toSalesDraftTour(tour: RankedTour["tour"]): SalesDraftTour {
  return {
    title: tour.title,
    destination: tour.destination,
    durationHours: tour.durationHours,
    durationLabel: tour.durationLabel,
    priceFrom: tour.priceFrom,
    currency: tour.currency,
    url: tour.url,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface MessageDraftRepository {
  create(values: NewMessageDraftRow): Promise<MessageDraftRow>;
  findById(id: string): Promise<MessageDraftRow | null>;
  list(limit?: number): Promise<MessageDraftRow[]>;
  update(
    id: string,
    patch: Partial<NewMessageDraftRow>,
  ): Promise<MessageDraftRow | null>;
}

export class DrizzleMessageDraftRepository implements MessageDraftRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(values: NewMessageDraftRow): Promise<MessageDraftRow> {
    const [row] = await this.db.insert(messageDrafts).values(values).returning();
    return row as MessageDraftRow;
  }

  async findById(id: string): Promise<MessageDraftRow | null> {
    const [row] = await this.db
      .select()
      .from(messageDrafts)
      .where(eq(messageDrafts.id, id));
    return row ?? null;
  }

  async list(limit = 100): Promise<MessageDraftRow[]> {
    return this.db
      .select()
      .from(messageDrafts)
      .orderBy(desc(messageDrafts.createdAt))
      .limit(limit);
  }

  async update(
    id: string,
    patch: Partial<NewMessageDraftRow>,
  ): Promise<MessageDraftRow | null> {
    const [row] = await this.db
      .update(messageDrafts)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(messageDrafts.id, id))
      .returning();
    return row ?? null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CreateDraftInput {
  sourceItemId: string;
  /** Override the draft language; otherwise inferred from the qualification. */
  language?: string;
  /** Delivery channel (default "manual" — a human copies & sends). */
  channel?: Channel;
  /** Max tours to recommend (spec: up to three). */
  limit?: number;
}

export interface CopiedDraft {
  draftId: string;
  subject: string | null;
  body: string;
  language: string;
}

export interface MessageDraftService {
  createForSourceItem(input: CreateDraftInput): Promise<MessageDraftRow>;
  get(id: string): Promise<MessageDraftRow>;
  list(): Promise<MessageDraftRow[]>;
  edit(
    id: string,
    patch: { subject?: string | null; body?: string },
  ): Promise<MessageDraftRow>;
  approve(id: string, approvedBy: string): Promise<MessageDraftRow>;
  reject(
    id: string,
    reason: string,
  ): Promise<MessageDraftRow>;
  /** Return an approved draft's text for a human to copy & send manually. */
  copyApproved(id: string): Promise<CopiedDraft>;
}

export interface MessageDraftServiceDeps {
  matchingService: TourMatchingService;
  qualificationRepo: QualificationRepository;
  tourMatchRepo: TourMatchRepository;
  draftRepo: MessageDraftRepository;
  activityLog: ActivityLogRepository;
  logger: Logger;
}

export class SalesDraftAgent implements MessageDraftService {
  constructor(private readonly deps: MessageDraftServiceDeps) {}

  async createForSourceItem(input: CreateDraftInput): Promise<MessageDraftRow> {
    const q = await this.deps.qualificationRepo.findBySourceItemId(
      input.sourceItemId,
    );
    if (!q) {
      throw new NotFoundError(
        `Qualification for source item ${input.sourceItemId}`,
      );
    }

    // Rank verified tours (also persists tour_matches for this request).
    const ranked = await this.deps.matchingService.matchForSourceItem(
      input.sourceItemId,
      { limit: input.limit ?? 3, persist: true },
    );

    const language = input.language ?? q.language ?? "en";
    const draft = composeSalesDraft({
      language,
      destination: q.destination ?? q.city,
      activity: q.activityCategory,
      tours: ranked.map((r) => toSalesDraftTour(r.tour)),
    });

    const matchesRows = await this.deps.tourMatchRepo.listBySourceItem(
      input.sourceItemId,
    );
    const topMatchId = matchesRows[0]?.id ?? null;

    const row = await this.deps.draftRepo.create({
      leadId: null,
      sourceItemId: input.sourceItemId,
      tourMatchId: topMatchId,
      channel: input.channel ?? "manual",
      language: draft.language,
      subject: draft.subject,
      body: draft.body,
      // Pending until a human explicitly approves. Never auto-sent.
      status: "pending_approval",
      approvalStatus: "pending",
    });

    await this.deps.activityLog.append({
      entityType: "message_draft",
      entityId: row.id,
      action: "draft.created",
      actor: "ai",
      metadata: {
        sourceItemId: input.sourceItemId,
        language: draft.language,
        recommendedTours: ranked.length,
      },
    });
    this.deps.logger.info("sales draft created (pending approval)", {
      draftId: row.id,
      sourceItemId: input.sourceItemId,
      recommendedTours: ranked.length,
    });
    return row;
  }

  async get(id: string): Promise<MessageDraftRow> {
    const row = await this.deps.draftRepo.findById(id);
    if (!row) throw new NotFoundError(`MessageDraft ${id}`);
    return row;
  }

  list(): Promise<MessageDraftRow[]> {
    return this.deps.draftRepo.list();
  }

  async edit(
    id: string,
    patch: { subject?: string | null; body?: string },
  ): Promise<MessageDraftRow> {
    const existing = await this.get(id);
    if (existing.status === "sent") {
      throw new ValidationError("cannot edit a draft that was already sent");
    }
    // Any edit invalidates a prior approval and returns the draft to pending.
    const updated = await this.deps.draftRepo.update(id, {
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      status: "pending_approval",
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
    });
    await this.deps.activityLog.append({
      entityType: "message_draft",
      entityId: id,
      action: "draft.edited",
      actor: "human",
    });
    return updated as MessageDraftRow;
  }

  async approve(id: string, approvedBy: string): Promise<MessageDraftRow> {
    const existing = await this.get(id);
    if (existing.status === "rejected") {
      throw new ValidationError("cannot approve a rejected draft; edit it first");
    }
    // Approve only. This does NOT post to any platform (no auto-send).
    const updated = await this.deps.draftRepo.update(id, {
      status: "approved",
      approvalStatus: "approved",
      approvedBy,
      approvedAt: new Date().toISOString(),
      rejectionReason: null,
    });
    await this.deps.activityLog.append({
      entityType: "message_draft",
      entityId: id,
      action: "draft.approved",
      actor: "human",
      metadata: { approvedBy },
    });
    this.deps.logger.info("sales draft approved (not sent)", {
      draftId: id,
      approvedBy,
    });
    return updated as MessageDraftRow;
  }

  async reject(id: string, reason: string): Promise<MessageDraftRow> {
    await this.get(id);
    const updated = await this.deps.draftRepo.update(id, {
      status: "rejected",
      approvalStatus: "rejected",
      rejectionReason: reason,
      approvedBy: null,
      approvedAt: null,
    });
    await this.deps.activityLog.append({
      entityType: "message_draft",
      entityId: id,
      action: "draft.rejected",
      actor: "human",
      metadata: { reason },
    });
    return updated as MessageDraftRow;
  }

  async copyApproved(id: string): Promise<CopiedDraft> {
    const row = await this.get(id);
    if (row.approvalStatus !== "approved") {
      throw new ValidationError(
        "only approved drafts can be copied for sending",
      );
    }
    await this.deps.activityLog.append({
      entityType: "message_draft",
      entityId: id,
      action: "draft.copied",
      actor: "human",
    });
    return {
      draftId: row.id,
      subject: row.subject,
      body: row.body,
      language: row.language,
    };
  }
}

export function createMessageDraftService(
  deps: MessageDraftServiceDeps,
): MessageDraftService {
  return new SalesDraftAgent(deps);
}

// ---------------------------------------------------------------------------
// Channel sending — intentionally NOT implemented (no automatic posting).
// ---------------------------------------------------------------------------

export interface OutreachSendResult {
  draftId: string;
  channel: Channel;
  deliveredAt: string;
}

/** A messaging integration. Implementations are opt-in & consented (future). */
export interface OutreachChannelSender {
  readonly channel: Channel;
  send(draft: MessageDraft): Promise<OutreachSendResult>;
}

export class NotImplementedChannelSender implements OutreachChannelSender {
  constructor(public readonly channel: Channel) {}
  async send(_draft: MessageDraft): Promise<OutreachSendResult> {
    throw new NotImplementedError(`outreach.send via "${this.channel}"`);
  }
}

import { passesEgyptExcursionPrefilter } from "@tourest/shared";
import { z } from "zod";
import type { Logger } from "../../../../core/logger";
import { RateLimiter } from "../../../../core/rateLimiter";
import type { SourceRow } from "../../../../db/schema";
import type { SourceRepository } from "../../index";
import type { AdapterCapabilities, RawSourceRecord, SourceAdapter } from "../types";

/**
 * Telegram adapter — official Bot API only.
 *
 * COMPLIANCE:
 *  - Only ingests updates the Bot API delivers to us (which already respects
 *    Telegram's privacy mode and group membership). We never scrape, never read
 *    private chats without authorization, and never send unsolicited messages.
 *  - A per-source chat allowlist (`monitoredChatIds`) further restricts what we
 *    store. If the allowlist is non-empty, messages from other chats are dropped.
 *  - Privacy mode (default ON for group bots): Telegram only forwards messages
 *    that mention the bot, are commands, or are replies to the bot. We surface
 *    this as `privacyModeEnabled` for operator awareness; we do not try to defeat it.
 */

export const telegramConfigSchema = z.object({
  /** Allowlist of chat ids the bot is authorized to monitor. Empty = none. */
  monitoredChatIds: z.array(z.number().int()).default([]),
  /** Documents that Telegram privacy mode is expected to be ON. */
  privacyModeEnabled: z.boolean().default(true),
  /** Apply the Egypt-excursion keyword prefilter before storing. */
  keywordPrefilter: z.boolean().default(true),
  /** Max updates to pull per poll. */
  pollLimit: z.number().int().positive().max(100).default(100),
  /** Next getUpdates offset (last processed update_id + 1). */
  offset: z.number().int().nonnegative().default(0),
});
export type TelegramConfig = z.infer<typeof telegramConfigSchema>;

// --- Minimal Bot API shapes we consume ---
export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}
export interface TelegramMessage {
  message_id: number;
  date: number; // unix seconds
  chat: TelegramChat;
  text?: string;
}
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

export interface GetUpdatesParams {
  offset?: number;
  limit?: number;
  timeoutSec?: number;
}

/** Injectable Bot API client (mocked in tests — no network required). */
export interface TelegramClient {
  getUpdates(params: GetUpdatesParams): Promise<TelegramUpdate[]>;
}

type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface TelegramBotClientOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  rateLimiter?: RateLimiter;
  timeoutMs?: number;
}

/** Real Telegram Bot API client. Token is never logged. */
export class TelegramBotClient implements TelegramClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly rateLimiter: RateLimiter;
  private readonly timeoutMs: number;

  constructor(
    private readonly token: string,
    options: TelegramBotClientOptions = {},
  ) {
    this.baseUrl = options.baseUrl ?? "https://api.telegram.org";
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
    // Default: 1 poll/sec burst of 3 — Bot API tolerates frequent getUpdates.
    this.rateLimiter =
      options.rateLimiter ?? new RateLimiter({ capacity: 3, refillPerSecond: 1 });
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async getUpdates(params: GetUpdatesParams): Promise<TelegramUpdate[]> {
    if (!this.rateLimiter.tryRemoveTokens(1)) {
      throw new Error("Telegram getUpdates rate limit exceeded");
    }
    const query = new URLSearchParams();
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    query.set("timeout", String(params.timeoutSec ?? 0));

    const url = `${this.baseUrl}/bot${this.token}/getUpdates?${query.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Telegram API HTTP ${res.status}`);
      const body = (await res.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!body.ok || !Array.isArray(body.result)) {
        throw new Error("Telegram API returned a non-ok payload");
      }
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Pure mapping from Bot API updates to normalized records, applying the
 * allowlist and keyword prefilter. Returns only records we are allowed to keep.
 */
export function telegramUpdatesToRecords(
  updates: TelegramUpdate[],
  config: TelegramConfig,
): RawSourceRecord[] {
  const records: RawSourceRecord[] = [];
  const allowlist = new Set(config.monitoredChatIds);

  for (const update of updates) {
    const msg = update.message ?? update.channel_post;
    if (!msg || typeof msg.text !== "string" || msg.text.trim().length === 0) {
      continue;
    }
    // Enforce allowlist: if configured, only permitted chats pass.
    if (allowlist.size > 0 && !allowlist.has(msg.chat.id)) continue;
    // Egypt-excursion prefilter.
    if (config.keywordPrefilter && !passesEgyptExcursionPrefilter(msg.text)) {
      continue;
    }

    records.push({
      externalId: `${msg.chat.id}:${msg.message_id}`,
      url: null,
      content: msg.text,
      language: null,
      collectedAt: new Date(msg.date * 1000).toISOString(),
      accessPermissionStatus: "authorized",
      isAuthorizedMessage: true,
      // Privacy-conscious: store chat context only, never sender identity.
      metadata: {
        provider: "telegram",
        chatId: msg.chat.id,
        chatTitle: msg.chat.title ?? null,
        chatType: msg.chat.type,
        messageId: msg.message_id,
        updateId: update.update_id,
      },
    });
  }
  return records;
}

/** Compute the next getUpdates offset from a batch of updates. */
export function computeNextOffset(
  updates: TelegramUpdate[],
  currentOffset: number,
): number {
  let max = currentOffset - 1;
  for (const u of updates) if (u.update_id > max) max = u.update_id;
  return max + 1;
}

const CAPABILITIES: AdapterCapabilities = {
  manualIngestion: true,
  scheduledIngestion: true,
};

export class TelegramAdapter implements SourceAdapter<void> {
  readonly type = "telegram" as const;
  readonly capabilities = CAPABILITIES;

  constructor(
    private readonly client: TelegramClient,
    private readonly logger: Logger,
    /** Optional: persist the advanced getUpdates offset after each poll. */
    private readonly sourceRepo?: SourceRepository,
  ) {}

  parseConfig(config: unknown): TelegramConfig {
    return telegramConfigSchema.parse(config ?? {});
  }

  async collectScheduled(source: SourceRow): Promise<RawSourceRecord[]> {
    const config = this.parseConfig(source.config);
    const updates = await this.client.getUpdates({
      offset: config.offset,
      limit: config.pollLimit,
      timeoutSec: 0,
    });
    const records = telegramUpdatesToRecords(updates, config);

    // Advance offset past ALL fetched updates (including filtered ones) so we
    // never re-poll already-seen messages.
    const nextOffset = computeNextOffset(updates, config.offset);
    if (this.sourceRepo && nextOffset !== config.offset) {
      await this.sourceRepo.update(source.id, {
        config: { ...config, offset: nextOffset },
      });
    }

    this.logger.info("telegram poll complete", {
      sourceId: source.id,
      updates: updates.length,
      kept: records.length,
      nextOffset,
    });
    return records;
  }

  collectManual(source: SourceRow): Promise<RawSourceRecord[]> {
    // Manual trigger performs an immediate poll.
    return this.collectScheduled(source);
  }
}

export function createTelegramAdapter(
  client: TelegramClient,
  logger: Logger,
  sourceRepo?: SourceRepository,
): TelegramAdapter {
  return new TelegramAdapter(client, logger, sourceRepo);
}

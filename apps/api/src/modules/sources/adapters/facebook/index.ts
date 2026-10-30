import { z } from "zod";
import { ACCESS_PERMISSION_STATUSES } from "@tourest/shared";
import { NotImplementedError } from "../../../../core/errors";
import { parseCsvRecords } from "../../../../core/csv";
import type { Logger } from "../../../../core/logger";
import type { SourceRow } from "../../../../db/schema";
import type { AdapterCapabilities, RawSourceRecord, SourceAdapter } from "../types";

/**
 * Facebook adapter — manual & authorized import ONLY.
 *
 * COMPLIANCE: No unauthorized Facebook Groups scraping and no browser
 * automation to evade platform restrictions. This adapter accepts content a
 * human has lawfully copied from PUBLIC discussions (pasted text or URLs) or a
 * CSV export. A future authorized Meta Graph API integration is defined as an
 * interface only (not implemented).
 */

export const facebookConfigSchema = z.object({
  /** Default permission status applied to imported items. */
  defaultAccessPermissionStatus: z
    .enum(ACCESS_PERMISSION_STATUSES)
    .default("public"),
});
export type FacebookConfig = z.infer<typeof facebookConfigSchema>;

const manualItemSchema = z.object({
  url: z.string().url().nullable().optional(),
  text: z.string().min(1).max(20000),
  language: z.string().max(16).nullable().optional(),
});

export const facebookManualInputSchema = z
  .object({
    /** A single pasted text snippet. */
    text: z.string().min(1).max(20000).optional(),
    /** Optional URL/provenance for the single pasted text. */
    url: z.string().url().optional(),
    language: z.string().max(16).optional(),
    /** Multiple explicit items. */
    items: z.array(manualItemSchema).optional(),
    /** Raw CSV content with columns: url,text,language,collected_at. */
    csv: z.string().optional(),
    /** Override permission status for this import. */
    accessPermissionStatus: z.enum(ACCESS_PERMISSION_STATUSES).optional(),
  })
  .refine(
    (v) => Boolean(v.text) || (v.items && v.items.length > 0) || Boolean(v.csv),
    { message: "Provide at least one of: text, items, or csv" },
  );
export type FacebookManualInput = z.infer<typeof facebookManualInputSchema>;

/**
 * FUTURE: authorized Meta Graph API integration. Defined for DI/forward
 * compatibility; intentionally NOT implemented (requires app review & consent).
 */
export interface MetaGraphApiClient {
  readonly authorized: boolean;
  fetchAuthorizedPosts(pageOrGroupId: string): Promise<RawSourceRecord[]>;
}

export class NotImplementedMetaGraphApiClient implements MetaGraphApiClient {
  readonly authorized = false;
  async fetchAuthorizedPosts(_id: string): Promise<RawSourceRecord[]> {
    throw new NotImplementedError("facebook.metaGraphApi.fetchAuthorizedPosts");
  }
}

const CAPABILITIES: AdapterCapabilities = {
  manualIngestion: true,
  scheduledIngestion: false,
};

export class FacebookAdapter implements SourceAdapter<unknown> {
  readonly type = "facebook" as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly logger: Logger) {}

  parseConfig(config: unknown): FacebookConfig {
    return facebookConfigSchema.parse(config ?? {});
  }

  async collectManual(
    source: SourceRow,
    rawInput: unknown,
  ): Promise<RawSourceRecord[]> {
    // Validate untrusted input at the boundary.
    const input = facebookManualInputSchema.parse(rawInput);
    const config = this.parseConfig(source.config);
    const permission =
      input.accessPermissionStatus ?? config.defaultAccessPermissionStatus;
    const nowIso = new Date().toISOString();
    const records: RawSourceRecord[] = [];

    const push = (
      content: string,
      url: string | null,
      language: string | null,
      collectedAt: string,
      origin: string,
    ): void => {
      const trimmed = content.trim();
      if (trimmed.length === 0) return;
      records.push({
        externalId: url,
        url,
        content: trimmed,
        language,
        collectedAt,
        accessPermissionStatus: permission,
        isAuthorizedMessage: false, // public discussion content, not a DM
        metadata: {
          provider: "facebook",
          importOrigin: origin,
          importedAt: nowIso,
        },
      });
    };

    if (input.text) {
      push(input.text, input.url ?? null, input.language ?? null, nowIso, "text");
    }

    for (const item of input.items ?? []) {
      push(item.text, item.url ?? null, item.language ?? null, nowIso, "items");
    }

    if (input.csv) {
      for (const rec of parseCsvRecords(input.csv)) {
        const text = rec.text ?? rec.content ?? "";
        const url = rec.url && rec.url.length > 0 ? rec.url : null;
        const language = rec.language && rec.language.length > 0 ? rec.language : null;
        const collectedAt =
          rec.collected_at && rec.collected_at.length > 0
            ? rec.collected_at
            : nowIso;
        push(text, url, language, collectedAt, "csv");
      }
    }

    this.logger.info("facebook manual import parsed", {
      sourceId: source.id,
      records: records.length,
    });
    return records;
  }
}

export function createFacebookAdapter(logger: Logger): FacebookAdapter {
  return new FacebookAdapter(logger);
}

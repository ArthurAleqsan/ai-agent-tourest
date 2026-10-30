import type { AccessPermissionStatus, SourceType } from "@tourest/shared";
import type { SourceRow } from "../../../db/schema";

/**
 * A normalized raw record produced by a source adapter, before it enters the
 * shared ingestion pipeline (Normalize -> Validate -> Deduplicate -> Store ->
 * Queue for AI qualification).
 */
export interface RawSourceRecord {
  externalId?: string | null;
  url?: string | null;
  content: string;
  language?: string | null;
  collectedAt?: string;
  accessPermissionStatus?: AccessPermissionStatus;
  isAuthorizedMessage?: boolean;
  /** Provenance metadata (chat id, import filename, etc.). */
  metadata?: Record<string, unknown>;
}

export interface AdapterCapabilities {
  manualIngestion: boolean;
  scheduledIngestion: boolean;
}

/**
 * A source adapter turns an external source into {@link RawSourceRecord}s.
 * Adapters NEVER send outbound messages and NEVER bypass platform access
 * controls — they only process content the operator is permitted to see.
 */
export interface SourceAdapter<TManualInput = unknown> {
  readonly type: SourceType;
  readonly capabilities: AdapterCapabilities;
  /** Validate & parse `source.config` into typed config (throws if invalid). */
  parseConfig(config: unknown): unknown;
  /** Scheduled/pull collection. Present only if capabilities.scheduledIngestion. */
  collectScheduled?(source: SourceRow): Promise<RawSourceRecord[]>;
  /** Manual collection with adapter-specific input. */
  collectManual?(
    source: SourceRow,
    input: TManualInput,
  ): Promise<RawSourceRecord[]>;
}

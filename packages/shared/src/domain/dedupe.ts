import type { SourceType } from "../enums";

/**
 * Deduplication helpers.
 *
 * These are intentionally dependency-free and runtime-agnostic (no `node:crypto`)
 * so they can run identically in the browser, in Node, and under Vitest.
 * We use FNV-1a (64-bit) which is fast, stable, and good enough for content
 * de-duplication keys (NOT for cryptographic security).
 */

/** Normalize free text for stable hashing/comparison. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * FNV-1a 64-bit hash returning a zero-padded 16-char hex string.
 * Implemented with BigInt for determinism across platforms.
 */
export function stableHash(input: string): string {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;

  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    // Encode as UTF-8 bytes so multi-byte chars hash deterministically.
    const codePoint = input.charCodeAt(i);
    hash ^= BigInt(codePoint & 0xff);
    hash = (hash * FNV_PRIME) & MASK_64;
    if (codePoint > 0xff) {
      hash ^= BigInt((codePoint >> 8) & 0xff);
      hash = (hash * FNV_PRIME) & MASK_64;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** Content hash = stable hash of normalized content. */
export function computeContentHash(rawContent: string): string {
  return stableHash(normalizeText(rawContent));
}

export interface SourceItemDedupeInput {
  sourceType: SourceType;
  /** Stable identifier from the origin source, if any. */
  externalId?: string | null;
  /** Canonical URL of the item, if any. */
  url?: string | null;
  /** Raw content, used as a fallback signal when no externalId/url exists. */
  rawContent: string;
}

/**
 * Build a deterministic dedupe key for a SourceItem.
 *
 * Priority:
 *   1. sourceType + externalId  (most reliable)
 *   2. sourceType + normalized url
 *   3. sourceType + content hash (fallback)
 */
export function computeSourceItemDedupeKey(input: SourceItemDedupeInput): string {
  const { sourceType, externalId, url, rawContent } = input;

  if (externalId && externalId.trim().length > 0) {
    return `${sourceType}:ext:${externalId.trim()}`;
  }
  if (url && url.trim().length > 0) {
    return `${sourceType}:url:${stableHash(normalizeText(url))}`;
  }
  return `${sourceType}:content:${computeContentHash(rawContent)}`;
}

export interface LeadDedupeInput {
  /** Normalized contact handle (email/phone/username), if known. */
  contactHandle?: string | null;
  /** Display name fallback. */
  displayName?: string | null;
  /** Origin source item id as last-resort uniqueness. */
  sourceItemId: string;
}

/**
 * Build a deterministic dedupe key for a Lead so the same person collected
 * from multiple source items can be merged/detected.
 */
export function computeLeadDedupeKey(input: LeadDedupeInput): string {
  const { contactHandle, displayName, sourceItemId } = input;

  if (contactHandle && contactHandle.trim().length > 0) {
    return `handle:${stableHash(normalizeText(contactHandle))}`;
  }
  if (displayName && displayName.trim().length > 0) {
    return `name:${stableHash(normalizeText(displayName))}`;
  }
  return `item:${sourceItemId}`;
}

/**
 * Data-retention helpers.
 *
 * Tourest AI Lead Hunter is privacy-conscious: every collected item carries
 * retention metadata so it can be purged or reviewed on schedule.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the retention expiry timestamp (ISO string) for an item collected
 * at `collectedAt`, kept for `retentionDays`.
 *
 * @param collectedAt ISO timestamp or Date of collection.
 * @param retentionDays positive number of days to retain.
 */
export function computeRetentionExpiry(
  collectedAt: string | Date,
  retentionDays: number,
): string {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new RangeError("retentionDays must be a positive, finite number");
  }
  const base =
    collectedAt instanceof Date ? collectedAt : new Date(collectedAt);
  if (Number.isNaN(base.getTime())) {
    throw new TypeError(`Invalid collectedAt timestamp: ${String(collectedAt)}`);
  }
  return new Date(base.getTime() + retentionDays * MS_PER_DAY).toISOString();
}

/**
 * Whether an item whose retention expires at `retentionExpiresAt` is expired
 * relative to `now`. Items with a null expiry are treated as never expiring.
 */
export function isRetentionExpired(
  retentionExpiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (retentionExpiresAt === null) return false;
  const expiry = new Date(retentionExpiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new TypeError(
      `Invalid retentionExpiresAt timestamp: ${retentionExpiresAt}`,
    );
  }
  return expiry.getTime() <= now.getTime();
}

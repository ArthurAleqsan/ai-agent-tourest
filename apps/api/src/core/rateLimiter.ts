/**
 * Simple token-bucket rate limiter (pure, injectable clock for tests).
 *
 * Used to keep source adapters polite (e.g. Telegram Bot API polling, manual
 * ingestion bursts) and to respect provider limits without any external deps.
 */
export interface RateLimiterOptions {
  /** Maximum number of tokens in the bucket. */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSecond: number;
  /** Clock function (ms). Injectable for deterministic tests. */
  now?: () => number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.capacity = options.capacity;
    this.refillPerSecond = options.refillPerSecond;
    this.now = options.now ?? (() => Date.now());
    this.tokens = options.capacity;
    this.lastRefill = this.now();
  }

  private refill(): void {
    const now = this.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSecond,
    );
    this.lastRefill = now;
  }

  /** Try to consume `count` tokens; returns false if not enough are available. */
  tryRemoveTokens(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /** Current (refilled) token count — mainly for tests/metrics. */
  availableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

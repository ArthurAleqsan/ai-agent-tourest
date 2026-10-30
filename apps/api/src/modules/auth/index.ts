import { randomBytes, timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "../../core/errors";
import type { Logger } from "../../core/logger";

/**
 * Local admin authentication.
 *
 * Single-admin, environment-based credentials (no third-party auth service,
 * $0 cost). On successful login we mint an in-memory session token; the SPA
 * sends it as `Authorization: Bearer <token>`. When no password is configured,
 * auth is DISABLED for local development (with a warning) so the app still runs
 * out-of-the-box — production deployments MUST set ADMIN_PASSWORD.
 */

export interface AuthSession {
  token: string;
  username: string;
}

export interface AuthService {
  /** True when a password is configured and auth is enforced. */
  readonly enabled: boolean;
  login(username: string, password: string): AuthSession;
  validate(token: string | undefined | null): boolean;
  logout(token: string): void;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export class LocalAuthService implements AuthService {
  readonly enabled: boolean;
  private readonly sessions = new Set<string>();

  constructor(
    private readonly username: string,
    private readonly password: string,
    logger?: Logger,
  ) {
    this.enabled = password.length > 0;
    if (!this.enabled) {
      logger?.warn(
        "ADMIN_PASSWORD is not set — dashboard authentication is DISABLED (local dev only)",
      );
    }
  }

  login(username: string, password: string): AuthSession {
    if (!this.enabled) {
      // Auth disabled: issue a token but it is not required by middleware.
      const token = randomBytes(24).toString("hex");
      this.sessions.add(token);
      return { token, username: username || this.username };
    }
    const ok =
      safeEqual(username, this.username) && safeEqual(password, this.password);
    if (!ok) throw new UnauthorizedError("Invalid username or password");
    const token = randomBytes(24).toString("hex");
    this.sessions.add(token);
    return { token, username };
  }

  validate(token: string | undefined | null): boolean {
    if (!this.enabled) return true;
    if (!token) return false;
    return this.sessions.has(token);
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }
}

export function createAuthService(
  opts: { username: string; password: string },
  logger?: Logger,
): AuthService {
  return new LocalAuthService(opts.username, opts.password, logger);
}

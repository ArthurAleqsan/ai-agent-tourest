import type { RequestHandler } from "express";
import type { AuthService } from "../../modules/auth/index";

/** Extract a bearer token (or x-admin-token header) from the request. */
export function extractToken(req: {
  header(name: string): string | undefined;
}): string {
  const header = req.header("authorization") ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.header("x-admin-token")?.trim() ?? "";
}

/**
 * Gate protected routes behind the local admin session. When auth is disabled
 * (no ADMIN_PASSWORD), requests pass through for local development.
 */
export function requireAuth(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    if (!auth.enabled) return next();
    if (auth.validate(extractToken(req))) return next();
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  };
}

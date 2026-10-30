import { Router } from "express";
import { z } from "zod";
import type { AppContainer } from "../core/di/container";
import { extractToken } from "./middleware/auth";
import { asyncHandler } from "./asyncHandler";

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export function createAuthRouter(container: AppContainer): Router {
  const router = Router();
  const { authService } = container;

  router.get(
    "/auth/status",
    asyncHandler(async (req, res) => {
      const token = extractToken(req);
      res.json({
        enabled: authService.enabled,
        authenticated: authService.validate(token),
      });
    }),
  );

  router.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const { username, password } = loginSchema.parse(req.body);
      const session = authService.login(username, password);
      res.json(session);
    }),
  );

  router.post(
    "/auth/logout",
    asyncHandler(async (req, res) => {
      const token = extractToken(req);
      if (token) authService.logout(token);
      res.json({ ok: true });
    }),
  );

  return router;
}

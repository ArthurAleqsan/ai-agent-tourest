import cors from "cors";
import express, { type Express, type Request } from "express";
import { APP_NAME, APP_VERSION } from "@tourest/shared";
import { env } from "./config/env";
import type { AppContainer } from "./core/di/container";
import { createAuthRouter } from "./http/auth";
import { createCatalogRouter } from "./http/catalog";
import { createDashboardRouter } from "./http/dashboard";
import { createHealthRouter } from "./http/health";
import { createIngestionRouter } from "./http/ingestion";
import { createOutreachRouter } from "./http/outreach";
import { createQualificationRouter } from "./http/qualification";
import { requireAuth } from "./http/middleware/auth";
import { errorHandler, notFoundHandler } from "./http/middleware/error";

const PUBLIC_API_PATHS = new Set([
  "/health",
  "/auth/status",
  "/auth/login",
  "/telegram/webhook",
]);

function isPublicApi(req: Request): boolean {
  if (PUBLIC_API_PATHS.has(req.path)) return true;
  if (req.method === "POST" && req.path === "/auth/logout") return true;
  return false;
}

/**
 * Build the Express application from an injected container.
 * Pure factory (no listening) so it can be exercised in tests.
 */
export function createServer(container: AppContainer): Express {
  const app = express();

  app.use(
    cors({
      origin: env.webOrigins,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // API routes are namespaced under /api.
  app.get("/", (_req, res) => {
    res.json({ name: APP_NAME, version: APP_VERSION, docs: "/api/health" });
  });
  app.use("/api", createHealthRouter(container));
  app.use("/api", createAuthRouter(container));

  // Local admin auth: skipped for health, login, and the Telegram webhook
  // (the webhook has its own shared-secret check).
  const gate = requireAuth(container.authService);
  app.use("/api", (req, res, next) => {
    if (isPublicApi(req)) return next();
    return gate(req, res, next);
  });

  app.use("/api", createQualificationRouter(container));
  app.use("/api", createIngestionRouter(container));
  app.use("/api", createCatalogRouter(container));
  app.use("/api", createOutreachRouter(container));
  app.use("/api", createDashboardRouter(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

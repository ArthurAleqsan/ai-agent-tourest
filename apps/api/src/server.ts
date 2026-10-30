import cors from "cors";
import express, { type Express } from "express";
import { APP_NAME, APP_VERSION } from "@tourest/shared";
import { env } from "./config/env";
import type { AppContainer } from "./core/di/container";
import { createHealthRouter } from "./http/health";
import { errorHandler, notFoundHandler } from "./http/middleware/error";

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

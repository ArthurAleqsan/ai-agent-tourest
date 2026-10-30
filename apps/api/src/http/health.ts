import { Router } from "express";
import { sql } from "drizzle-orm";
import { APP_NAME, APP_VERSION, type HealthStatus } from "@tourest/shared";
import type { AppContainer } from "../core/di/container";

const startedAt = Date.now();

/**
 * Health endpoint router.
 * GET /health          -> liveness + DB connectivity check
 */
export function createHealthRouter(container: AppContainer): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    let databaseOk = true;
    try {
      // Lightweight connectivity probe.
      container.dbHandle.db.run(sql`select 1`);
    } catch (err) {
      databaseOk = false;
      container.logger.error("health db check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const body: HealthStatus = {
      status: databaseOk ? "ok" : "degraded",
      service: APP_NAME,
      version: APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        database: databaseOk ? "ok" : "error",
      },
    };

    res.status(databaseOk ? 200 : 503).json(body);
  });

  return router;
}

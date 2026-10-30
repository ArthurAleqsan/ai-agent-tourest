import { APP_NAME, APP_VERSION } from "@tourest/shared";
import { env } from "./config/env";
import { createContainer } from "./core/di/container";
import { logger } from "./core/logger";
import { createServer } from "./server";

/** Process entrypoint: build container, start HTTP server, wire shutdown. */
function bootstrap(): void {
  const container = createContainer();
  const app = createServer(container);

  container.jobScheduler.start();

  const server = app.listen(env.PORT, () => {
    logger.info(`${APP_NAME} v${APP_VERSION} API listening`, {
      port: env.PORT,
      env: env.NODE_ENV,
      health: `http://localhost:${env.PORT}/api/health`,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info("shutting down", { signal });
    server.close(() => {
      container.shutdown();
      process.exit(0);
    });
    // Force-exit if graceful shutdown stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap();

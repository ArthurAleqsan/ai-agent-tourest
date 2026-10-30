import type { IngestionCoordinator } from "../ingestion/coordinator";
import type { SourceRepository } from "../sources/index";
import type { Job, JobRunResult } from "./index";

export interface TelegramPollJobDeps {
  schedule: string;
  coordinator: IngestionCoordinator;
  sourceRepo: SourceRepository;
}

/**
 * Scheduled job that polls every ENABLED Telegram source via the Bot API and
 * ingests permitted messages. Disabled sources are skipped. Failures for one
 * source do not abort the others.
 */
export function createTelegramPollJob(deps: TelegramPollJobDeps): Job {
  return {
    name: "telegram-poll",
    schedule: deps.schedule,
    async run(ctx): Promise<JobRunResult> {
      const sources = await deps.sourceRepo.listEnabledByType("telegram");
      if (sources.length === 0) {
        return { status: "skipped", itemsProcessed: 0 };
      }

      let itemsProcessed = 0;
      const errors: string[] = [];
      for (const source of sources) {
        try {
          const summary = await deps.coordinator.runScheduled(source.id);
          itemsProcessed += summary.stored;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${source.id}: ${message}`);
          ctx.logger.warn("telegram poll failed for source", {
            sourceId: source.id,
            error: message,
          });
        }
      }

      return {
        status: errors.length > 0 && itemsProcessed === 0 ? "failed" : "success",
        itemsProcessed,
        ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      };
    },
  };
}

import cron, { type ScheduledTask } from "node-cron";
import type { JobRunStatus } from "@tourest/shared";
import type { Logger } from "../../core/logger";

/**
 * Jobs module boundary.
 *
 * A thin wrapper around node-cron so background jobs can be registered through
 * DI. Concrete jobs (collection, ingestion, qualification sweeps) are added in
 * later steps; the scheduler itself is wired and safe to start with zero jobs.
 */

export interface JobContext {
  logger: Logger;
  /** The time the run was triggered. */
  triggeredAt: Date;
}

export interface JobRunResult {
  status: Extract<JobRunStatus, "success" | "failed" | "skipped">;
  itemsProcessed: number;
  error?: string;
}

export interface Job {
  readonly name: string;
  /** Standard 5/6-field cron expression. */
  readonly schedule: string;
  run(ctx: JobContext): Promise<JobRunResult>;
}

export interface JobScheduler {
  register(job: Job): void;
  list(): Job[];
  start(): void;
  stop(): void;
}

export class CronJobScheduler implements JobScheduler {
  private readonly jobs = new Map<string, Job>();
  private readonly tasks = new Map<string, ScheduledTask>();
  private started = false;

  constructor(private readonly logger: Logger) {}

  register(job: Job): void {
    if (!cron.validate(job.schedule)) {
      throw new Error(
        `Invalid cron schedule "${job.schedule}" for job "${job.name}"`,
      );
    }
    this.jobs.set(job.name, job);
    this.logger.debug("job registered", {
      job: job.name,
      schedule: job.schedule,
    });
  }

  list(): Job[] {
    return [...this.jobs.values()];
  }

  start(): void {
    if (this.started) return;
    for (const job of this.jobs.values()) {
      const task = cron.schedule(job.schedule, () => {
        void this.execute(job);
      });
      this.tasks.set(job.name, task);
    }
    this.started = true;
    this.logger.info("job scheduler started", { jobs: this.jobs.size });
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
    }
    this.tasks.clear();
    this.started = false;
    this.logger.info("job scheduler stopped");
  }

  private async execute(job: Job): Promise<void> {
    const triggeredAt = new Date();
    this.logger.info("job started", { job: job.name });
    try {
      const result = await job.run({ logger: this.logger, triggeredAt });
      this.logger.info("job finished", {
        job: job.name,
        status: result.status,
        itemsProcessed: result.itemsProcessed,
      });
    } catch (err) {
      this.logger.error("job failed", {
        job: job.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function createJobScheduler(logger: Logger): JobScheduler {
  // No jobs registered yet (no scraping/AI jobs in this step).
  return new CronJobScheduler(logger);
}

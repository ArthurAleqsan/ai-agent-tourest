import cron, { type ScheduledTask } from "node-cron";
import { desc, eq } from "drizzle-orm";
import type { JobConfigView, JobRunStatus } from "@tourest/shared";
import type { Logger } from "../../core/logger";
import type { AppDatabase } from "../../db/client";
import { jobRuns, type JobRunRow } from "../../db/schema";

/**
 * Jobs module — configurable background orchestration.
 *
 * Wraps node-cron with per-job configuration: enable/disable, pause/resume,
 * retries with backoff, failure reporting, concurrency limits, and persisted
 * run history. Concrete job bodies live in `standardJobs.ts`.
 */

export interface JobContext {
  logger: Logger;
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
  readonly description?: string;
  readonly defaultMaxRetries?: number;
  readonly defaultConcurrencyLimit?: number;
  run(ctx: JobContext): Promise<JobRunResult>;
}

export interface JobConfigOverride {
  enabled?: boolean;
  schedule?: string;
  maxRetries?: number;
  concurrencyLimit?: number;
}

interface JobState {
  job: Job;
  schedule: string;
  description: string;
  enabled: boolean;
  paused: boolean;
  maxRetries: number;
  concurrencyLimit: number;
  running: number;
  task?: ScheduledTask;
}

export interface JobScheduler {
  register(job: Job, override?: JobConfigOverride): void;
  list(): JobConfigView[];
  start(): void;
  stop(): void;
  /** Run a registered job immediately (manual trigger). */
  runNow(name: string): Promise<JobRunResult>;
  pause(name: string): void;
  resume(name: string): void;
  setConfig(name: string, patch: JobConfigOverride): JobConfigView;
  history(limit?: number): Promise<JobRunRow[]>;
}

export interface JobRunRepository {
  start(jobName: string): Promise<JobRunRow>;
  finish(
    id: string,
    update: {
      status: JobRunStatus;
      itemsProcessed: number;
      error?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void>;
  recent(limit?: number): Promise<JobRunRow[]>;
}

export class DrizzleJobRunRepository implements JobRunRepository {
  constructor(private readonly db: AppDatabase) {}

  async start(jobName: string): Promise<JobRunRow> {
    const [row] = await this.db
      .insert(jobRuns)
      .values({
        jobName,
        status: "running",
        startedAt: new Date().toISOString(),
      })
      .returning();
    return row as JobRunRow;
  }

  async finish(
    id: string,
    update: {
      status: JobRunStatus;
      itemsProcessed: number;
      error?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await this.db
      .update(jobRuns)
      .set({
        status: update.status,
        itemsProcessed: update.itemsProcessed,
        error: update.error ?? null,
        metadata: update.metadata ?? null,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(jobRuns.id, id));
  }

  async recent(limit = 50): Promise<JobRunRow[]> {
    return this.db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.createdAt))
      .limit(limit);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class CronJobScheduler implements JobScheduler {
  private readonly jobs = new Map<string, JobState>();
  private started = false;

  constructor(
    private readonly logger: Logger,
    private readonly jobRunRepo?: JobRunRepository,
    /** Retry backoff base (ms); kept tiny in tests. */
    private readonly retryBackoffMs = 500,
  ) {}

  register(job: Job, override: JobConfigOverride = {}): void {
    if (!cron.validate(job.schedule)) {
      throw new Error(
        `Invalid cron schedule "${job.schedule}" for job "${job.name}"`,
      );
    }
    this.jobs.set(job.name, {
      job,
      schedule: override.schedule ?? job.schedule,
      description: job.description ?? "",
      enabled: override.enabled ?? true,
      paused: false,
      maxRetries: override.maxRetries ?? job.defaultMaxRetries ?? 0,
      concurrencyLimit:
        override.concurrencyLimit ?? job.defaultConcurrencyLimit ?? 1,
      running: 0,
    });
    this.logger.debug("job registered", { job: job.name });
  }

  list(): JobConfigView[] {
    return [...this.jobs.values()].map((s) => ({
      name: s.job.name as JobConfigView["name"],
      schedule: s.schedule,
      enabled: s.enabled,
      paused: s.paused,
      maxRetries: s.maxRetries,
      concurrencyLimit: s.concurrencyLimit,
      running: s.running > 0,
      description: s.description,
    }));
  }

  start(): void {
    if (this.started) return;
    for (const state of this.jobs.values()) this.schedule(state);
    this.started = true;
    this.logger.info("job scheduler started", { jobs: this.jobs.size });
  }

  stop(): void {
    for (const state of this.jobs.values()) {
      state.task?.stop();
      state.task = undefined;
    }
    this.started = false;
    this.logger.info("job scheduler stopped");
  }

  async runNow(name: string): Promise<JobRunResult> {
    const state = this.requireJob(name);
    return this.execute(state, "manual");
  }

  pause(name: string): void {
    this.requireJob(name).paused = true;
    this.logger.info("job paused", { job: name });
  }

  resume(name: string): void {
    this.requireJob(name).paused = false;
    this.logger.info("job resumed", { job: name });
  }

  setConfig(name: string, patch: JobConfigOverride): JobConfigView {
    const state = this.requireJob(name);
    if (patch.schedule !== undefined) {
      if (!cron.validate(patch.schedule)) {
        throw new Error(`Invalid cron schedule "${patch.schedule}"`);
      }
      state.schedule = patch.schedule;
    }
    if (patch.enabled !== undefined) state.enabled = patch.enabled;
    if (patch.maxRetries !== undefined) state.maxRetries = patch.maxRetries;
    if (patch.concurrencyLimit !== undefined) {
      state.concurrencyLimit = patch.concurrencyLimit;
    }
    // Re-schedule if running.
    if (this.started) {
      state.task?.stop();
      state.task = undefined;
      this.schedule(state);
    }
    return this.list().find((j) => j.name === name) as JobConfigView;
  }

  history(limit?: number): Promise<JobRunRow[]> {
    return this.jobRunRepo?.recent(limit) ?? Promise.resolve([]);
  }

  private schedule(state: JobState): void {
    if (!state.enabled) return;
    state.task = cron.schedule(state.schedule, () => {
      void this.execute(state, "scheduled");
    });
  }

  private async execute(
    state: JobState,
    trigger: "manual" | "scheduled",
  ): Promise<JobRunResult> {
    if (state.paused) {
      this.logger.debug("job skipped (paused)", { job: state.job.name });
      return { status: "skipped", itemsProcessed: 0, error: "paused" };
    }
    if (state.running >= state.concurrencyLimit) {
      this.logger.warn("job skipped (concurrency limit)", {
        job: state.job.name,
        running: state.running,
        limit: state.concurrencyLimit,
      });
      return {
        status: "skipped",
        itemsProcessed: 0,
        error: "concurrency limit reached",
      };
    }

    state.running += 1;
    const runRow = await this.jobRunRepo?.start(state.job.name);
    const maxAttempts = state.maxRetries + 1;
    let attempt = 0;
    let result: JobRunResult | undefined;
    let lastError: string | undefined;

    try {
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          const r = await state.job.run({
            logger: this.logger,
            triggeredAt: new Date(),
          });
          result = r;
          if (r.status !== "failed") break;
          lastError = r.error;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          result = { status: "failed", itemsProcessed: 0, error: lastError };
        }
        if (attempt < maxAttempts) {
          this.logger.warn("job attempt failed, retrying", {
            job: state.job.name,
            attempt,
            error: lastError,
          });
          await sleep(this.retryBackoffMs * attempt);
        }
      }

      const finalResult: JobRunResult = result ?? {
        status: "failed",
        itemsProcessed: 0,
        error: lastError ?? "unknown error",
      };

      if (runRow) {
        await this.jobRunRepo?.finish(runRow.id, {
          status: finalResult.status,
          itemsProcessed: finalResult.itemsProcessed,
          error: finalResult.error ?? null,
          metadata: { attempts: attempt, trigger },
        });
      }

      if (finalResult.status === "failed") {
        this.logger.error("job failed", {
          job: state.job.name,
          attempts: attempt,
          error: finalResult.error,
        });
      } else {
        this.logger.info("job finished", {
          job: state.job.name,
          status: finalResult.status,
          itemsProcessed: finalResult.itemsProcessed,
          attempts: attempt,
        });
      }
      return finalResult;
    } finally {
      state.running -= 1;
    }
  }

  private requireJob(name: string): JobState {
    const state = this.jobs.get(name);
    if (!state) throw new Error(`Unknown job: ${name}`);
    return state;
  }
}

export function createJobScheduler(
  logger: Logger,
  jobRunRepo?: JobRunRepository,
  retryBackoffMs?: number,
): JobScheduler {
  return new CronJobScheduler(logger, jobRunRepo, retryBackoffMs);
}

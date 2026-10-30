import { describe, expect, it } from "vitest";
import { createJobScheduler, type Job } from "../src/modules/jobs/index";
import { logger } from "../src/core/logger";

function makeJob(name: string, run: Job["run"], extras: Partial<Job> = {}): Job {
  return {
    name,
    schedule: "* * * * *",
    defaultMaxRetries: 0,
    defaultConcurrencyLimit: 1,
    run,
    ...extras,
  };
}

describe("CronJobScheduler", () => {
  it("retries a failing job up to maxRetries then reports failure", async () => {
    let attempts = 0;
    const scheduler = createJobScheduler(logger, undefined, 1);
    scheduler.register(
      makeJob(
        "ai-qualification",
        async () => {
          attempts += 1;
          throw new Error("boom");
        },
        { defaultMaxRetries: 2 },
      ),
    );

    const result = await scheduler.runNow("ai-qualification");
    expect(result.status).toBe("failed");
    expect(result.error).toBe("boom");
    expect(attempts).toBe(3); // first try + 2 retries
  });

  it("skips a paused job without running it", async () => {
    let attempts = 0;
    const scheduler = createJobScheduler(logger);
    scheduler.register(
      makeJob("deduplication", async () => {
        attempts += 1;
        return { status: "success", itemsProcessed: 1 };
      }),
    );
    scheduler.pause("deduplication");
    const paused = await scheduler.runNow("deduplication");
    expect(paused.status).toBe("skipped");
    expect(paused.error).toBe("paused");
    expect(attempts).toBe(0);

    scheduler.resume("deduplication");
    const resumed = await scheduler.runNow("deduplication");
    expect(resumed.status).toBe("success");
    expect(attempts).toBe(1);
  });

  it("enforces a concurrency limit", async () => {
    const scheduler = createJobScheduler(logger);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    scheduler.register(
      makeJob(
        "source-ingestion",
        async () => {
          await blocker;
          return { status: "success", itemsProcessed: 1 };
        },
        { defaultConcurrencyLimit: 1 },
      ),
    );

    const first = scheduler.runNow("source-ingestion");
    // Give the first run a tick to increment `running`.
    await new Promise((r) => setTimeout(r, 10));
    const second = await scheduler.runNow("source-ingestion");
    expect(second.status).toBe("skipped");
    expect(second.error).toMatch(/concurrency/i);

    release();
    const result = await first;
    expect(result.status).toBe("success");
  });

  it("lists configurable jobs with pause/retry/concurrency fields", () => {
    const scheduler = createJobScheduler(logger);
    scheduler.register(makeJob("follow-up-reminders", async () => ({
      status: "success",
      itemsProcessed: 0,
    })));
    const [job] = scheduler.list();
    expect(job?.name).toBe("follow-up-reminders");
    expect(job?.paused).toBe(false);
    expect(job?.concurrencyLimit).toBe(1);
    expect(job?.enabled).toBe(true);
  });
});

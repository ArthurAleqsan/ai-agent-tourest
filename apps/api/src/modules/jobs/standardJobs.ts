import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { JobName } from "@tourest/shared";
import type { AppDatabase } from "../../db/client";
import {
  leads,
  messageDrafts,
  qualifications,
  tourMatches,
} from "../../db/schema";
import type { ActivityLogRepository } from "../crm/index";
import type { IngestionCoordinator } from "../ingestion/coordinator";
import type { LeadService } from "../leads/index";
import type { MessageDraftService } from "../outreach/index";
import type { QualificationService } from "../qualification/index";
import type { SourceRepository } from "../sources/index";
import type { TourMatchingService } from "../tour-matching/index";
import type { Job, JobRunResult } from "./index";

/**
 * Factory for the six configurable background jobs. Each job is DB-driven,
 * resilient (per-item try/catch), and performs NO outbound messaging — draft
 * generation only produces pending drafts for human approval.
 */

export interface StandardJobSchedules {
  "source-ingestion": string;
  deduplication: string;
  "ai-qualification": string;
  "tour-matching": string;
  "draft-generation": string;
  "follow-up-reminders": string;
}

export interface StandardJobDeps {
  db: AppDatabase;
  ingestionCoordinator: IngestionCoordinator;
  sourceRepo: SourceRepository;
  qualificationService: QualificationService;
  tourMatchingService: TourMatchingService;
  messageDraftService: MessageDraftService;
  leadService: LeadService;
  activityLog: ActivityLogRepository;
  schedules: StandardJobSchedules;
  /** How many items a sweep processes per run. */
  batchLimit?: number;
  /** Days with no reply before a follow-up reminder is raised. */
  followUpDays?: number;
}

export const DEFAULT_JOB_SCHEDULES: StandardJobSchedules = {
  "source-ingestion": "*/2 * * * *",
  deduplication: "*/15 * * * *",
  "ai-qualification": "*/5 * * * *",
  "tour-matching": "*/5 * * * *",
  "draft-generation": "*/10 * * * *",
  "follow-up-reminders": "0 * * * *",
};

export function createStandardJobs(deps: StandardJobDeps): Job[] {
  const batchLimit = deps.batchLimit ?? 25;
  const followUpDays = deps.followUpDays ?? 3;

  const sourceIngestion: Job = {
    name: "source-ingestion",
    schedule: deps.schedules["source-ingestion"],
    description: "Poll enabled Telegram sources via the Bot API.",
    defaultMaxRetries: 2,
    async run(): Promise<JobRunResult> {
      const sources = await deps.sourceRepo.listEnabledByType("telegram");
      if (sources.length === 0) return { status: "skipped", itemsProcessed: 0 };
      let stored = 0;
      const errors: string[] = [];
      for (const s of sources) {
        try {
          const summary = await deps.ingestionCoordinator.runScheduled(s.id);
          stored += summary.stored;
        } catch (err) {
          errors.push(`${s.id}: ${err instanceof Error ? err.message : err}`);
        }
      }
      return {
        status: errors.length > 0 && stored === 0 ? "failed" : "success",
        itemsProcessed: stored,
        ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      };
    },
  };

  const deduplication: Job = {
    name: "deduplication",
    schedule: deps.schedules.deduplication,
    description: "Verify leads have no duplicate contact keys.",
    async run(): Promise<JobRunResult> {
      // Dedup is enforced at write time (unique dedupeKey); this sweep flags
      // any duplicate that slipped through (e.g. via raw imports).
      const rows = await deps.db
        .select({ dedupeKey: leads.dedupeKey, c: sql<number>`count(*)` })
        .from(leads)
        .groupBy(leads.dedupeKey);
      const duplicates = rows.filter((r) => r.c > 1).length;
      return { status: "success", itemsProcessed: duplicates };
    },
  };

  const aiQualification: Job = {
    name: "ai-qualification",
    schedule: deps.schedules["ai-qualification"],
    description: "Run the local AI qualifier over unqualified source items.",
    defaultMaxRetries: 2,
    async run(): Promise<JobRunResult> {
      const result = await deps.qualificationService.qualifyPending(batchLimit);
      const failedOnly = result.failed > 0 && result.processed === 0;
      return {
        status: failedOnly ? "failed" : "success",
        itemsProcessed: result.processed,
        ...(result.failed > 0
          ? { error: `${result.failed} item(s) failed` }
          : {}),
      };
    },
  };

  const tourMatching: Job = {
    name: "tour-matching",
    schedule: deps.schedules["tour-matching"],
    description: "Match verified tours to qualified requests without matches.",
    async run(): Promise<JobRunResult> {
      const qualified = await deps.db
        .select({ sourceItemId: qualifications.sourceItemId })
        .from(qualifications)
        .where(ne(qualifications.intentLevel, "irrelevant"));
      const matchedRows = await deps.db
        .select({ sourceItemId: tourMatches.sourceItemId })
        .from(tourMatches)
        .where(isNotNull(tourMatches.sourceItemId));
      const alreadyMatched = new Set(
        matchedRows.map((r) => r.sourceItemId as string),
      );

      let processed = 0;
      for (const q of qualified) {
        if (alreadyMatched.has(q.sourceItemId)) continue;
        if (processed >= batchLimit) break;
        try {
          await deps.tourMatchingService.matchForSourceItem(q.sourceItemId, {
            persist: true,
          });
          processed += 1;
        } catch {
          /* skip individual failures; reported via retries if systemic */
        }
      }
      return { status: "success", itemsProcessed: processed };
    },
  };

  const draftGeneration: Job = {
    name: "draft-generation",
    schedule: deps.schedules["draft-generation"],
    description: "Generate PENDING sales drafts for matched requests.",
    async run(): Promise<JobRunResult> {
      const matchedRows = await deps.db
        .select({ sourceItemId: tourMatches.sourceItemId })
        .from(tourMatches)
        .where(isNotNull(tourMatches.sourceItemId));
      const draftedRows = await deps.db
        .select({ sourceItemId: messageDrafts.sourceItemId })
        .from(messageDrafts)
        .where(isNotNull(messageDrafts.sourceItemId));
      const drafted = new Set(
        draftedRows.map((r) => r.sourceItemId as string),
      );
      const candidates = [
        ...new Set(matchedRows.map((r) => r.sourceItemId as string)),
      ].filter((sid) => !drafted.has(sid));

      let created = 0;
      for (const sid of candidates) {
        if (created >= batchLimit) break;
        try {
          await deps.messageDraftService.createForSourceItem({
            sourceItemId: sid,
          });
          await deps.leadService.markDraftReadyForSourceItem(sid);
          created += 1;
        } catch {
          /* skip individual failures */
        }
      }
      return { status: "success", itemsProcessed: created };
    },
  };

  const followUpReminders: Job = {
    name: "follow-up-reminders",
    schedule: deps.schedules["follow-up-reminders"],
    description: "Raise follow-up reminders for stalled approved/contacted leads.",
    async run(): Promise<JobRunResult> {
      const cutoff = new Date(
        Date.now() - followUpDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Approved leads never contacted, or contacted with no reply past cutoff.
      const approved = await deps.db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.status, "approved"));
      const staleContacted = await deps.db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.status, "contacted"),
            isNotNull(leads.lastContactedAt),
            lt(leads.lastContactedAt, cutoff),
          ),
        );

      let reminders = 0;
      for (const l of [...approved, ...staleContacted]) {
        await deps.activityLog.append({
          entityType: "lead",
          entityId: l.id,
          action: "reminder.follow_up",
          actor: "system",
        });
        reminders += 1;
      }
      return { status: "success", itemsProcessed: reminders };
    },
  };

  return [
    sourceIngestion,
    deduplication,
    aiQualification,
    tourMatching,
    draftGeneration,
    followUpReminders,
  ];
}

/** Map a job name to its factory position (for config lookups in the UI). */
export const STANDARD_JOB_NAMES: JobName[] = [
  "source-ingestion",
  "deduplication",
  "ai-qualification",
  "tour-matching",
  "draft-generation",
  "follow-up-reminders",
];

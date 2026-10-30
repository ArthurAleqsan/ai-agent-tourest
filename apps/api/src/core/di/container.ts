import { env } from "../../config/env";
import { createDb, type DbHandle } from "../../db/client";
import { logger, type Logger } from "../logger";

import { createAiClient, type AiClient } from "../../modules/ai/index";
import {
  createSourceCollectorRegistry,
  type SourceCollectorRegistry,
} from "../../modules/sources/index";
import {
  createIngestionService,
  type IngestionService,
} from "../../modules/ingestion/index";
import {
  createQualificationService,
  type QualificationService,
} from "../../modules/qualification/index";
import {
  createTourMatcher,
  type TourMatcher,
} from "../../modules/tour-matching/index";
import {
  createMessageDraftService,
  type MessageDraftService,
} from "../../modules/outreach/index";
import {
  DrizzleActivityLogRepository,
  DrizzleLeadRepository,
  type ActivityLogRepository,
  type LeadRepository,
} from "../../modules/crm/index";
import {
  createJobScheduler,
  type JobScheduler,
} from "../../modules/jobs/index";

/**
 * Application composition root.
 *
 * Every external integration is injected through an interface so it can be
 * swapped (real vs stub vs mock) without touching consumers. Unbuilt modules
 * are wired to "NotImplemented" placeholders that fail loudly if invoked.
 */
export interface AppContainer {
  readonly logger: Logger;
  readonly dbHandle: DbHandle;

  // Repositories (real, Drizzle-backed)
  readonly leadRepository: LeadRepository;
  readonly activityLogRepository: ActivityLogRepository;

  // External-integration abstractions (placeholders in this step)
  readonly aiClient: AiClient;
  readonly sourceCollectors: SourceCollectorRegistry;
  readonly ingestionService: IngestionService;
  readonly qualificationService: QualificationService;
  readonly tourMatcher: TourMatcher;
  readonly messageDraftService: MessageDraftService;

  // Background jobs
  readonly jobScheduler: JobScheduler;

  shutdown(): void;
}

export interface CreateContainerOptions {
  databasePath?: string;
}

export function createContainer(options: CreateContainerOptions = {}): AppContainer {
  const dbHandle = createDb(options.databasePath ?? env.DATABASE_PATH);
  const { db } = dbHandle;

  const leadRepository = new DrizzleLeadRepository(db);
  const activityLogRepository = new DrizzleActivityLogRepository(db);

  const aiClient = createAiClient({
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL,
  });

  const sourceCollectors = createSourceCollectorRegistry();
  const ingestionService = createIngestionService();
  const qualificationService = createQualificationService(aiClient);
  const tourMatcher = createTourMatcher();
  const messageDraftService = createMessageDraftService(aiClient);
  const jobScheduler = createJobScheduler(logger);

  return {
    logger,
    dbHandle,
    leadRepository,
    activityLogRepository,
    aiClient,
    sourceCollectors,
    ingestionService,
    qualificationService,
    tourMatcher,
    messageDraftService,
    jobScheduler,
    shutdown() {
      jobScheduler.stop();
      dbHandle.close();
    },
  };
}

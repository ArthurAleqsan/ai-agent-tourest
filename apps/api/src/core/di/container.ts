import { env } from "../../config/env";
import { createDb, type DbHandle } from "../../db/client";
import { logger, type Logger } from "../logger";

import { createAiClient, type AiClient } from "../../modules/ai/index";
import {
  DrizzleSourceItemRepository,
  DrizzleSourceRepository,
  createSourceCollectorRegistry,
  type SourceCollectorRegistry,
  type SourceRepository,
} from "../../modules/sources/index";
import {
  createAdapterRegistry,
  type AdapterRegistry,
} from "../../modules/sources/adapters/registry";
import {
  TelegramBotClient,
  createTelegramAdapter,
  type TelegramClient,
} from "../../modules/sources/adapters/telegram/index";
import { createFacebookAdapter } from "../../modules/sources/adapters/facebook/index";
import {
  ActivityLogQualificationQueue,
  createIngestionService,
  type IngestionService,
} from "../../modules/ingestion/index";
import { IngestionCoordinator } from "../../modules/ingestion/coordinator";
import {
  DrizzleQualificationRepository,
  createQualificationService,
  type QualificationRepository,
  type QualificationService,
} from "../../modules/qualification/index";
import {
  DrizzleSeoOpportunityRepository,
  createSeoService,
  type SeoOpportunityRepository,
  type SeoService,
} from "../../modules/seo/index";
import {
  DrizzleTourMatchRepository,
  createTourMatchingService,
  type TourMatchRepository,
  type TourMatchingService,
} from "../../modules/tour-matching/index";
import {
  DrizzleMessageDraftRepository,
  createMessageDraftService,
  type MessageDraftRepository,
  type MessageDraftService,
} from "../../modules/outreach/index";
import {
  DrizzleTourRepository,
  HttpTourCatalogProvider,
  NotConfiguredTourCatalogProvider,
  createTourCatalogService,
  type TourCatalogProvider,
  type TourCatalogService,
  type TourRepository,
} from "../../modules/catalog/index";
import {
  DrizzleActivityLogRepository,
  type ActivityLogRepository,
} from "../../modules/crm/index";
import {
  DrizzleLeadRepository,
  createLeadService,
  type LeadRepository,
  type LeadService,
} from "../../modules/leads/index";
import {
  DrizzleContactSuppressionService,
  DrizzleDataDeletionService,
  type ContactSuppressionService,
  type DataDeletionService,
} from "../../modules/privacy/index";
import {
  createAnalyticsService,
  type AnalyticsService,
} from "../../modules/analytics/index";
import { createAuthService, type AuthService } from "../../modules/auth/index";
import {
  DrizzleJobRunRepository,
  createJobScheduler,
  type JobRunRepository,
  type JobScheduler,
} from "../../modules/jobs/index";
import {
  DEFAULT_JOB_SCHEDULES,
  createStandardJobs,
} from "../../modules/jobs/standardJobs";

/**
 * Application composition root. Every integration is injected through an
 * interface so it can be swapped (real vs mock) without touching consumers.
 */
export interface AppContainer {
  readonly logger: Logger;
  readonly dbHandle: DbHandle;

  // Repositories (real, Drizzle-backed)
  readonly leadRepository: LeadRepository;
  readonly leadService: LeadService;
  readonly activityLogRepository: ActivityLogRepository;
  readonly sourceRepository: SourceRepository;
  readonly sourceItemRepository: DrizzleSourceItemRepository;
  readonly qualificationRepository: QualificationRepository;
  readonly seoOpportunityRepository: SeoOpportunityRepository;
  readonly jobRunRepository: JobRunRepository;
  readonly tourRepository: TourRepository;
  readonly tourMatchRepository: TourMatchRepository;
  readonly messageDraftRepository: MessageDraftRepository;

  // External-integration abstractions
  readonly aiClient: AiClient;
  readonly telegramClient: TelegramClient;
  readonly sourceCollectors: SourceCollectorRegistry;
  readonly adapterRegistry: AdapterRegistry;
  readonly ingestionService: IngestionService;
  readonly ingestionCoordinator: IngestionCoordinator;
  readonly qualificationService: QualificationService;
  readonly seoService: SeoService;
  readonly tourCatalogProvider: TourCatalogProvider;
  readonly tourCatalogService: TourCatalogService;
  readonly tourMatchingService: TourMatchingService;
  readonly messageDraftService: MessageDraftService;
  readonly analyticsService: AnalyticsService;
  readonly contactSuppressionService: ContactSuppressionService;
  readonly dataDeletionService: DataDeletionService;
  readonly authService: AuthService;

  // Background jobs
  readonly jobScheduler: JobScheduler;

  shutdown(): void;
}

export interface CreateContainerOptions {
  databasePath?: string;
  /** Inject a custom AI client (e.g. a mock) for tests/offline use. */
  aiClient?: AiClient;
  /** Inject a custom Telegram client (mocked in tests). */
  telegramClient?: TelegramClient;
  /** Inject a custom tour catalog provider (e.g. CSV/JSON/mock in tests). */
  tourCatalogProvider?: TourCatalogProvider;
  /** Override admin credentials (tests). Falls back to env. */
  adminUsername?: string;
  adminPassword?: string;
  /** Retry backoff for jobs (ms); tests set this very low. */
  jobRetryBackoffMs?: number;
}

export function createContainer(options: CreateContainerOptions = {}): AppContainer {
  const dbHandle = createDb(options.databasePath ?? env.DATABASE_PATH);
  const { db } = dbHandle;

  // --- Repositories ---
  const leadRepository = new DrizzleLeadRepository(db);
  const activityLogRepository = new DrizzleActivityLogRepository(db);
  const sourceRepository = new DrizzleSourceRepository(db);
  const sourceItemRepository = new DrizzleSourceItemRepository(
    db,
    sourceRepository,
  );
  const qualificationRepository = new DrizzleQualificationRepository(db);
  const seoOpportunityRepository = new DrizzleSeoOpportunityRepository(db);
  const jobRunRepository = new DrizzleJobRunRepository(db);
  const tourRepository = new DrizzleTourRepository(db);
  const tourMatchRepository = new DrizzleTourMatchRepository(db);
  const messageDraftRepository = new DrizzleMessageDraftRepository(db);

  // --- AI ---
  const aiClient =
    options.aiClient ??
    createAiClient({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_MODEL,
      timeoutMs: env.OLLAMA_TIMEOUT_MS,
      maxRetries: env.OLLAMA_MAX_RETRIES,
      temperature: env.OLLAMA_TEMPERATURE,
    });

  // --- Telegram client (token never logged; may be empty until configured) ---
  const telegramClient: TelegramClient =
    options.telegramClient ?? new TelegramBotClient(env.TELEGRAM_BOT_TOKEN);

  // --- Source adapters ---
  const adapterRegistry = createAdapterRegistry();
  adapterRegistry.register(
    createTelegramAdapter(telegramClient, logger, sourceRepository),
  );
  adapterRegistry.register(createFacebookAdapter(logger));

  // --- Ingestion pipeline + coordinator ---
  const qualificationQueue = new ActivityLogQualificationQueue(
    activityLogRepository,
    logger,
  );
  const ingestionService = createIngestionService(
    sourceRepository,
    sourceItemRepository,
    qualificationQueue,
    logger,
  );
  const ingestionCoordinator = new IngestionCoordinator(
    adapterRegistry,
    ingestionService,
    sourceRepository,
    logger,
  );

  // --- SEO (Yandex Wordstat) ---
  const seoService = createSeoService(
    sourceRepository,
    seoOpportunityRepository,
    activityLogRepository,
    logger,
  );

  // --- AI qualification ---
  const qualificationService = createQualificationService({
    ai: aiClient,
    sourceItemRepo: sourceItemRepository,
    qualificationRepo: qualificationRepository,
    activityLog: activityLogRepository,
    logger,
  });

  // --- Tour catalog (Step 4) ---
  // We never invent a Tourest API: use the authorized endpoint only when it is
  // explicitly configured, otherwise fall back to CSV/JSON import.
  const tourCatalogProvider: TourCatalogProvider =
    options.tourCatalogProvider ??
    (env.TOUR_CATALOG_API_URL
      ? new HttpTourCatalogProvider({
          url: env.TOUR_CATALOG_API_URL,
          token: env.TOUR_CATALOG_API_TOKEN || undefined,
          headerName: env.TOUR_CATALOG_API_HEADER,
        })
      : new NotConfiguredTourCatalogProvider());
  const tourCatalogService = createTourCatalogService(
    tourRepository,
    activityLogRepository,
    logger,
  );

  // --- Tour matching (Step 4) ---
  const tourMatchingService = createTourMatchingService({
    tourRepo: tourRepository,
    qualificationRepo: qualificationRepository,
    tourMatchRepo: tourMatchRepository,
    logger,
  });

  // --- Sales draft agent (Step 4) — human-in-the-loop, never auto-sends ---
  const messageDraftService = createMessageDraftService({
    matchingService: tourMatchingService,
    qualificationRepo: qualificationRepository,
    tourMatchRepo: tourMatchRepository,
    draftRepo: messageDraftRepository,
    activityLog: activityLogRepository,
    logger,
  });

  // --- Privacy (Step 5): contact suppression + data deletion ---
  const contactSuppressionService = new DrizzleContactSuppressionService(
    db,
    activityLogRepository,
    logger,
  );
  const dataDeletionService = new DrizzleDataDeletionService(
    db,
    activityLogRepository,
    logger,
  );

  // --- Leads (Step 5): promotion, pipeline, search, overrides ---
  const leadService = createLeadService({
    db,
    leadRepo: leadRepository,
    activityLog: activityLogRepository,
    suppression: contactSuppressionService,
    logger,
  });

  // --- Analytics (Step 5): confirmed-only metrics ---
  const analyticsService = createAnalyticsService(db, leadRepository);

  // --- Admin authentication (Step 5) ---
  const authService = createAuthService(
    {
      username: options.adminUsername ?? env.ADMIN_USERNAME,
      password: options.adminPassword ?? env.ADMIN_PASSWORD,
    },
    logger,
  );

  // --- Legacy/placeholder services ---
  const sourceCollectors = createSourceCollectorRegistry();

  // --- Background jobs (Step 5 orchestration) ---
  const jobScheduler = createJobScheduler(
    logger,
    jobRunRepository,
    options.jobRetryBackoffMs,
  );
  const disabledJobs = new Set(
    env.JOBS_DISABLED.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const standardJobs = createStandardJobs({
    db,
    ingestionCoordinator,
    sourceRepo: sourceRepository,
    qualificationService,
    tourMatchingService,
    messageDraftService,
    leadService,
    activityLog: activityLogRepository,
    schedules: {
      ...DEFAULT_JOB_SCHEDULES,
      "source-ingestion": env.INGESTION_TELEGRAM_CRON,
    },
  });
  for (const job of standardJobs) {
    jobScheduler.register(job, { enabled: !disabledJobs.has(job.name) });
  }

  return {
    logger,
    dbHandle,
    leadRepository,
    leadService,
    activityLogRepository,
    sourceRepository,
    sourceItemRepository,
    qualificationRepository,
    seoOpportunityRepository,
    jobRunRepository,
    tourRepository,
    tourMatchRepository,
    messageDraftRepository,
    aiClient,
    telegramClient,
    sourceCollectors,
    adapterRegistry,
    ingestionService,
    ingestionCoordinator,
    qualificationService,
    seoService,
    tourCatalogProvider,
    tourCatalogService,
    tourMatchingService,
    messageDraftService,
    analyticsService,
    contactSuppressionService,
    dataDeletionService,
    authService,
    jobScheduler,
    shutdown() {
      jobScheduler.stop();
      dbHandle.close();
    },
  };
}

import type {
  AnalyticsOverview,
  JobConfigView,
  LeadPipelineStatus,
  MarketRegion,
  QualificationIntentLevel,
  SourceType,
} from "@tourest/shared";

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
}

export interface AuthSession {
  token: string;
  username: string;
}

export interface SourceRow {
  id: string;
  name: string;
  type: SourceType;
  url: string | null;
  description: string | null;
  accessPermissionStatus: string;
  isEnabled: boolean;
  retentionDays: number;
  createdAt: string;
}

export interface SourceItemRow {
  id: string;
  sourceId: string;
  url: string | null;
  rawContent: string;
  language: string | null;
  accessPermissionStatus: string;
  isAuthorizedMessage: boolean;
  collectedAt: string;
  processedAt: string | null;
}

export interface QualificationRow {
  id: string;
  sourceItemId: string;
  intentScore: number;
  intentLevel: QualificationIntentLevel;
  destination: string | null;
  city: string | null;
  activityCategory: string | null;
  language: string | null;
  evidence: string[] | null;
  reasoning: string | null;
}

export interface SourceItemWithContext {
  item: SourceItemRow;
  sourceName: string | null;
  sourceType: SourceType | null;
  qualification: QualificationRow | null;
}

export interface LeadRow {
  id: string;
  sourceItemId: string;
  displayName: string | null;
  contactHandle: string | null;
  region: MarketRegion | null;
  destinationInterest: string | null;
  status: LeadPipelineStatus;
  notes: string | null;
  manualIntentScore: number | null;
  overrideReason: string | null;
  contactPermissionStatus: string;
  lastContactedAt: string | null;
  createdAt: string;
}

export interface EnrichedLead {
  lead: LeadRow;
  intentScore: number | null;
  intentLevel: string | null;
  qualificationId: string | null;
  evidence: string[];
  sourceId: string | null;
  sourceName: string | null;
  sourceType: SourceType | null;
  sourceItemUrl: string | null;
  sourceItemExcerpt: string | null;
}

export interface MessageDraftRow {
  id: string;
  sourceItemId: string | null;
  language: string;
  subject: string | null;
  body: string;
  status: string;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface RecommendationRow {
  match: {
    id: string;
    sourceItemId: string | null;
    tourId: string;
    score: number;
    rank: number;
    matchedOn: string[] | null;
    rationale: string | null;
    createdAt: string;
  };
  tourTitle: string | null;
  tourDestination: string | null;
  tourUrl: string | null;
  tourCategory: string | null;
}

export interface SeoOpportunityRow {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  demand: number | null;
  region: string;
  destination: string | null;
  activityCategory: string;
  commercialIntentScore: number;
  commercialIntentLevel: string;
  period: string | null;
}

export interface ActivityLogRow {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  actor: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface JobRunRow {
  id: string;
  jobName: string;
  status: string;
  itemsProcessed: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface ContactSuppressionRow {
  id: string;
  value: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AppSettings {
  authEnabled: boolean;
  ollamaModel: string;
  ollamaBaseUrl: string;
  catalogConfigured: boolean;
  telegramConfigured: boolean;
  jobsDisabled: string[];
  nodeEnv: string;
  followUpDays: number;
}

export type { AnalyticsOverview, JobConfigView };

import { healthStatusSchema, type HealthStatus } from "@tourest/shared";
import type {
  AnalyticsOverview,
  AppSettings,
  AuthSession,
  AuthStatus,
  ActivityLogRow,
  ContactSuppressionRow,
  EnrichedLead,
  JobConfigView,
  JobRunRow,
  MessageDraftRow,
  RecommendationRow,
  SeoOpportunityRow,
  SourceItemWithContext,
  SourceRow,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_KEY = "tourest.adminToken";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function readStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / SSR */
  }
}

function authHeaders(): Record<string, string> {
  const token = readStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(res: Response, path: string): Promise<never> {
  let message = `Request failed: ${path}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) message = body.error.message;
  } catch {
    /* ignore */
  }
  throw new ApiError(message, res.status);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) await parseError(res, path);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function jsonBody(body: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function fetchHealth(): Promise<HealthStatus> {
  const json = await request<unknown>("/api/health");
  return healthStatusSchema.parse(json);
}

export function fetchAuthStatus(): Promise<AuthStatus> {
  return request("/api/auth/status");
}

export async function login(
  username: string,
  password: string,
): Promise<AuthSession> {
  const session = await request<AuthSession>("/api/auth/login", {
    method: "POST",
    ...jsonBody({ username, password }),
  });
  storeToken(session.token);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    storeToken("");
  }
}

export function fetchAnalytics(): Promise<AnalyticsOverview> {
  return request("/api/analytics");
}

export function fetchSources(): Promise<SourceRow[]> {
  return request("/api/sources");
}

export function createSource(input: {
  name: string;
  type: SourceRow["type"];
  description?: string;
}): Promise<SourceRow> {
  return request("/api/sources", { method: "POST", ...jsonBody(input) });
}

export function patchSource(
  id: string,
  patch: { isEnabled?: boolean; name?: string },
): Promise<SourceRow> {
  return request(`/api/sources/${id}`, { method: "PATCH", ...jsonBody(patch) });
}

export function ingestSource(
  id: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request(`/api/sources/${id}/ingest`, {
    method: "POST",
    ...jsonBody(body),
  });
}

export function fetchSourceItems(): Promise<SourceItemWithContext[]> {
  return request("/api/source-items");
}

export function createSourceItem(rawContent: string): Promise<SourceItemRowLike> {
  return request("/api/source-items", {
    method: "POST",
    ...jsonBody({ rawContent }),
  });
}

interface SourceItemRowLike {
  id: string;
}

export function qualifySourceItem(id: string, force = false): Promise<unknown> {
  return request(`/api/source-items/${id}/qualify`, {
    method: "POST",
    ...jsonBody({ force }),
  });
}

export function deleteSourceItem(id: string): Promise<{ ok: boolean }> {
  return request(`/api/source-items/${id}`, { method: "DELETE" });
}

export function fetchLeads(params: Record<string, string | undefined> = {}): Promise<EnrichedLead[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/api/leads${suffix}`);
}

export function promoteLead(input: {
  sourceItemId: string;
  displayName?: string;
  contactHandle?: string;
}): Promise<{ lead: EnrichedLead["lead"]; created: boolean }> {
  return request("/api/leads", { method: "POST", ...jsonBody(input) });
}

export function setLeadStatus(id: string, status: string): Promise<unknown> {
  return request(`/api/leads/${id}/status`, {
    method: "POST",
    ...jsonBody({ status }),
  });
}

export function setLeadNotes(id: string, notes: string | null): Promise<unknown> {
  return request(`/api/leads/${id}/notes`, {
    method: "PATCH",
    ...jsonBody({ notes }),
  });
}

export function overrideLead(
  id: string,
  manualIntentScore: number,
  reason?: string,
): Promise<unknown> {
  return request(`/api/leads/${id}/override`, {
    method: "POST",
    ...jsonBody({ manualIntentScore, reason: reason ?? null }),
  });
}

export function deleteLead(id: string): Promise<{ ok: boolean }> {
  return request(`/api/leads/${id}`, { method: "DELETE" });
}

export function fetchRecommendations(): Promise<RecommendationRow[]> {
  return request("/api/recommendations");
}

export function matchSourceItem(id: string): Promise<unknown> {
  return request(`/api/source-items/${id}/match`, { method: "POST" });
}

export function fetchDrafts(): Promise<MessageDraftRow[]> {
  return request("/api/drafts");
}

export function createDraft(sourceItemId: string): Promise<MessageDraftRow> {
  return request(`/api/source-items/${sourceItemId}/draft`, { method: "POST" });
}

export function editDraft(
  id: string,
  patch: { subject?: string | null; body?: string },
): Promise<MessageDraftRow> {
  return request(`/api/drafts/${id}`, { method: "PATCH", ...jsonBody(patch) });
}

export function approveDraft(id: string, approvedBy: string): Promise<MessageDraftRow> {
  return request(`/api/drafts/${id}/approve`, {
    method: "POST",
    ...jsonBody({ approvedBy }),
  });
}

export function rejectDraft(id: string, reason: string): Promise<MessageDraftRow> {
  return request(`/api/drafts/${id}/reject`, {
    method: "POST",
    ...jsonBody({ reason }),
  });
}

export function copyDraft(
  id: string,
): Promise<{ draftId: string; subject: string | null; body: string; language: string }> {
  return request(`/api/drafts/${id}/copy`);
}

export function fetchSeo(): Promise<SeoOpportunityRow[]> {
  return request("/api/seo-opportunities");
}

export function fetchActivity(): Promise<ActivityLogRow[]> {
  return request("/api/activity");
}

export function fetchJobs(): Promise<JobConfigView[]> {
  return request("/api/jobs");
}

export function fetchJobRuns(): Promise<JobRunRow[]> {
  return request("/api/job-runs");
}

export function runJob(name: string): Promise<unknown> {
  return request(`/api/jobs/${name}/run`, { method: "POST" });
}

export function pauseJob(name: string): Promise<JobConfigView> {
  return request(`/api/jobs/${name}/pause`, { method: "POST" });
}

export function resumeJob(name: string): Promise<JobConfigView> {
  return request(`/api/jobs/${name}/resume`, { method: "POST" });
}

export function fetchSettings(): Promise<AppSettings> {
  return request("/api/settings");
}

export function fetchSuppressions(): Promise<ContactSuppressionRow[]> {
  return request("/api/suppressions");
}

export function addSuppression(input: {
  value: string;
  reason?: string;
}): Promise<ContactSuppressionRow> {
  return request("/api/suppressions", { method: "POST", ...jsonBody(input) });
}

export function removeSuppression(id: string): Promise<{ ok: boolean }> {
  return request(`/api/suppressions/${id}`, { method: "DELETE" });
}

export function purgeExpired(): Promise<{ deleted: number }> {
  return request("/api/privacy/purge", { method: "POST" });
}

export function importCatalogCsv(csv: string): Promise<unknown> {
  return request("/api/catalog/import", { method: "POST", ...jsonBody({ csv }) });
}

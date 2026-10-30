import { healthStatusSchema, type HealthStatus } from "@tourest/shared";

/**
 * Tiny typed fetch wrapper. Base URL comes from VITE_API_BASE_URL; when empty
 * the Vite dev proxy forwards /api to the backend.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError(`Request failed: ${path}`, res.status);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<HealthStatus> {
  const json = await apiGet<unknown>("/api/health");
  return healthStatusSchema.parse(json);
}

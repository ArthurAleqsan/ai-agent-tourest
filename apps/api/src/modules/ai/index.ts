import { AppError } from "../../core/errors";

/**
 * AI module boundary.
 *
 * The only AI dependency is a LOCAL Ollama HTTP API (zero cost, private).
 * This module implements a real client with timeout, bounded retries, and
 * graceful, typed errors. Response *content* validation (Zod) happens in the
 * qualification module; this layer only guarantees a successful HTTP call and
 * returns the raw text.
 */

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** Number of retries after the first attempt (0 = no retries). */
  maxRetries: number;
  /** Sampling temperature (0 = deterministic). */
  temperature: number;
}

export interface AiGenerateInput {
  prompt: string;
  system?: string;
  /** Override the configured temperature for this call. */
  temperature?: number;
  /** Ask the provider for strict JSON output. */
  format?: "json" | "text";
}

export interface AiGenerateResult {
  text: string;
  model: string;
  provider: string;
  /** Milliseconds spent generating (wall clock). */
  durationMs: number;
}

/** Dependency-injected abstraction over the local AI provider. */
export interface AiClient {
  readonly provider: string;
  readonly model: string;
  /** Whether the local model server is reachable right now. */
  isAvailable(): Promise<boolean>;
  generate(input: AiGenerateInput): Promise<AiGenerateResult>;
}

// ---------------------------------------------------------------------------
// Typed errors (graceful degradation upstream)
// ---------------------------------------------------------------------------

/** The AI provider is unreachable / timed out / returned a transport error. */
export class AiUnavailableError extends AppError {
  constructor(message: string, public readonly cause?: unknown) {
    super(`AI provider unavailable: ${message}`, 503, "AI_UNAVAILABLE");
  }
}

/** The AI provider responded but with an unusable HTTP response. */
export class AiResponseError extends AppError {
  constructor(message: string) {
    super(`AI provider error: ${message}`, 502, "AI_RESPONSE_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Fetch abstraction (injectable for tests, no network required)
// ---------------------------------------------------------------------------
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

interface OllamaGenerateResponse {
  response?: string;
  model?: string;
  done?: boolean;
  error?: string;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Real client for the local Ollama HTTP API. */
export class OllamaClient implements AiClient {
  readonly provider = "ollama";
  readonly model: string;

  constructor(
    private readonly config: OllamaConfig,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {
    this.model = config.model;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.withTimeout((signal) =>
        this.fetchImpl(`${this.config.baseUrl}/api/tags`, {
          method: "GET",
          signal,
        }),
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    const body = JSON.stringify({
      model: this.config.model,
      prompt: input.prompt,
      ...(input.system ? { system: input.system } : {}),
      stream: false,
      format: input.format === "text" ? undefined : "json",
      options: {
        temperature: input.temperature ?? this.config.temperature,
      },
    });

    const started = Date.now();
    const outcome = await this.callWithRetries(body);
    if (outcome instanceof Error) throw outcome;

    const { text, model } = outcome;
    return {
      text,
      model: model || this.config.model,
      provider: this.provider,
      durationMs: Date.now() - started,
    };
  }

  /**
   * Attempt the call up to `maxRetries + 1` times. Returns the parsed payload
   * on success, or returns the final Error to be thrown by the caller.
   */
  private async callWithRetries(
    body: string,
  ): Promise<{ text: string; model: string } | Error> {
    const attempts = this.config.maxRetries + 1;
    let lastErr: Error = new AiUnavailableError("no attempt made");

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.callOnce(body);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        // Do not retry on definitive response errors (bad request / bad JSON).
        if (err instanceof AiResponseError) break;
        if (attempt < attempts) {
          await sleep(Math.min(2000, 250 * 2 ** (attempt - 1)));
        }
      }
    }
    return lastErr;
  }

  private async callOnce(
    body: string,
  ): Promise<{ text: string; model: string }> {
    let res;
    try {
      res = await this.withTimeout((signal) =>
        this.fetchImpl(`${this.config.baseUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal,
        }),
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new AiUnavailableError(
          `request timed out after ${this.config.timeoutMs}ms`,
        );
      }
      throw new AiUnavailableError(
        err instanceof Error ? err.message : String(err),
        err,
      );
    }

    if (!res.ok) {
      // 5xx -> treat as transient (retryable); 4xx -> definitive.
      if (res.status >= 500) {
        throw new AiUnavailableError(`HTTP ${res.status} ${res.statusText}`);
      }
      throw new AiResponseError(`HTTP ${res.status} ${res.statusText}`);
    }

    let payload: OllamaGenerateResponse;
    try {
      payload = (await res.json()) as OllamaGenerateResponse;
    } catch (err) {
      throw new AiResponseError(
        `invalid JSON envelope from provider: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (payload.error) {
      throw new AiResponseError(payload.error);
    }
    if (typeof payload.response !== "string") {
      throw new AiResponseError("missing 'response' field in provider output");
    }

    return { text: payload.response, model: payload.model ?? this.config.model };
  }

  private async withTimeout<T>(
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createAiClient(config: OllamaConfig): AiClient {
  return new OllamaClient(config);
}

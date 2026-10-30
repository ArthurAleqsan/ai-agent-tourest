import {
  AiResponseError,
  AiUnavailableError,
  type AiClient,
  type AiGenerateInput,
  type AiGenerateResult,
} from "./index";

/**
 * Mock AI provider for tests and offline development.
 *
 * It never touches the network, so the full qualification pipeline can be
 * exercised without a running Ollama instance. Behavior is configurable to
 * simulate healthy responses, malformed output, and provider outages.
 */
export type MockMode =
  | { kind: "text"; text: string } // return this exact text
  | { kind: "json"; value: unknown } // return JSON.stringify(value)
  | { kind: "handler"; handler: (input: AiGenerateInput) => string }
  | { kind: "unavailable"; message?: string } // simulate outage
  | { kind: "responseError"; message?: string }; // simulate 4xx/bad envelope

export interface MockAiClientOptions {
  model?: string;
  available?: boolean;
  mode: MockMode;
}

export class MockAiClient implements AiClient {
  readonly provider = "mock";
  readonly model: string;
  private readonly available: boolean;
  private readonly mode: MockMode;

  /** Number of times generate() was invoked (useful for dedupe assertions). */
  public calls = 0;

  constructor(options: MockAiClientOptions) {
    this.model = options.model ?? "mock-model:latest";
    this.available = options.available ?? true;
    this.mode = options.mode;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async generate(input: AiGenerateInput): Promise<AiGenerateResult> {
    this.calls += 1;

    switch (this.mode.kind) {
      case "unavailable":
        throw new AiUnavailableError(this.mode.message ?? "mock outage");
      case "responseError":
        throw new AiResponseError(this.mode.message ?? "mock response error");
      case "text":
        return this.ok(this.mode.text);
      case "json":
        return this.ok(JSON.stringify(this.mode.value));
      case "handler":
        return this.ok(this.mode.handler(input));
      default:
        throw new AiResponseError("unknown mock mode");
    }
  }

  private ok(text: string): AiGenerateResult {
    return {
      text,
      model: this.model,
      provider: this.provider,
      durationMs: 1,
    };
  }
}

/** Convenience: a valid extraction JSON string for a typical "hot" lead. */
export function mockHotExtraction(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    isRelevant: true,
    language: "en",
    destination: "Egypt",
    city: "Hurghada",
    travelDates: "next month",
    travelersCount: 2,
    activityCategory: "diving",
    purchaseIntent: "explicit",
    urgency: "high",
    signals: {
      asksForPrice: true,
      requestsRecommendation: true,
      mentionsBooking: true,
      hasUpcomingTrip: true,
    },
    evidence: ["how much is a diving trip", "we arrive next month"],
    missingInformation: [],
    confidence: 0.9,
    reasoning: "Explicit booking intent with price request for an upcoming trip.",
    ...overrides,
  });
}

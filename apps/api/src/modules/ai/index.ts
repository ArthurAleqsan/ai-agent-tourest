import { NotImplementedError } from "../../core/errors";

/**
 * AI module boundary.
 *
 * The only AI dependency is a LOCAL Ollama HTTP API (zero cost, private).
 * This step defines the interface and a wired-but-unimplemented client so the
 * rest of the system can depend on the abstraction. HTTP calls are added in a
 * later step.
 */

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export interface AiGenerateInput {
  prompt: string;
  system?: string;
  /** 0..1 sampling temperature. */
  temperature?: number;
  /** Optional JSON schema hint for structured output. */
  format?: "json" | "text";
}

export interface AiGenerateResult {
  text: string;
  model: string;
  /** Milliseconds spent generating. */
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

/**
 * Placeholder Ollama client. Wired through DI but intentionally not built yet.
 */
export class NotImplementedOllamaClient implements AiClient {
  readonly provider = "ollama";
  readonly model: string;

  constructor(private readonly config: OllamaConfig) {
    this.model = config.model;
  }

  async isAvailable(): Promise<boolean> {
    // Not implemented yet: real reachability check against config.baseUrl.
    void this.config;
    return false;
  }

  async generate(_input: AiGenerateInput): Promise<AiGenerateResult> {
    throw new NotImplementedError("ai.generate (local Ollama integration)");
  }
}

export function createAiClient(config: OllamaConfig): AiClient {
  return new NotImplementedOllamaClient(config);
}

import { describe, expect, it, vi } from "vitest";
import {
  AiResponseError,
  AiUnavailableError,
  OllamaClient,
  type FetchLike,
  type OllamaConfig,
} from "../src/modules/ai/index";

const baseConfig: OllamaConfig = {
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen3:4b",
  timeoutMs: 1000,
  maxRetries: 2,
  temperature: 0,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "ERROR",
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("OllamaClient", () => {
  it("returns the model's response text on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ response: '{"ok":true}', model: "qwen3:4b", done: true }),
    ) as unknown as FetchLike;

    const client = new OllamaClient(baseConfig, fetchImpl);
    const result = await client.generate({ prompt: "hello", format: "json" });

    expect(result.text).toBe('{"ok":true}');
    expect(result.model).toBe("qwen3:4b");
    expect(result.provider).toBe("ollama");
  });

  it("retries transient failures up to maxRetries then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNREFUSED");
      return jsonResponse({ response: "{}", model: "qwen3:4b" });
    }) as unknown as FetchLike;

    const client = new OllamaClient(
      { ...baseConfig, maxRetries: 2 },
      fetchImpl,
    );
    const result = await client.generate({ prompt: "hi" });
    expect(result.text).toBe("{}");
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it("throws AiUnavailableError after exhausting retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as FetchLike;

    const client = new OllamaClient({ ...baseConfig, maxRetries: 1 }, fetchImpl);
    await expect(client.generate({ prompt: "hi" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry definitive 4xx response errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "bad" }, false, 400),
    ) as unknown as FetchLike;

    const client = new OllamaClient({ ...baseConfig, maxRetries: 3 }, fetchImpl);
    await expect(client.generate({ prompt: "hi" })).rejects.toBeInstanceOf(
      AiResponseError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps request timeouts (AbortError) to AiUnavailableError", async () => {
    const fetchImpl = vi.fn(async (_url, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as FetchLike;

    const client = new OllamaClient(
      { ...baseConfig, timeoutMs: 20, maxRetries: 0 },
      fetchImpl,
    );
    await expect(client.generate({ prompt: "hi" })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it("isAvailable returns false when the server is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("no server");
    }) as unknown as FetchLike;
    const client = new OllamaClient(baseConfig, fetchImpl);
    expect(await client.isAvailable()).toBe(false);
  });
});

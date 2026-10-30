import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load variables from apps/api/.env (if present) into process.env.
loadDotenv();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  /** Comma-separated allowed CORS origins. */
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().min(1).default("./data/tourest.db"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  /** Local Ollama model tag. Defaults to a Node-18-friendly Qwen3 model. */
  OLLAMA_MODEL: z.string().min(1).default("qwen3:4b"),
  /** Per-request timeout for AI calls (ms). */
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().max(600000).default(60000),
  /** Max retry attempts after the first failed AI call. */
  OLLAMA_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  /** Sampling temperature (0 = deterministic). */
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0),

  // --- Source adapters (Step 3) ---
  /** Telegram Bot API token. Empty until configured; never logged. */
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  /** Optional shared secret validated on the Telegram webhook endpoint. */
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  /** Cron schedule for the Telegram polling job. */
  INGESTION_TELEGRAM_CRON: z.string().default("*/2 * * * *"),

  // --- Tour catalog (Step 4) ---
  /**
   * Explicitly configured, AUTHORIZED Tourest catalog endpoint. Empty by
   * default — we do not assume/invent any Tourest API. When empty, use CSV/JSON
   * import instead.
   */
  TOUR_CATALOG_API_URL: z.string().default(""),
  /** Raw auth token value for the catalog endpoint (operator-defined scheme). */
  TOUR_CATALOG_API_TOKEN: z.string().default(""),
  /** Header carrying the token (default "Authorization"). */
  TOUR_CATALOG_API_HEADER: z.string().default("Authorization"),

  // --- Admin authentication (Step 5) ---
  /** Admin username for the local dashboard. */
  ADMIN_USERNAME: z.string().default("admin"),
  /**
   * Admin password. When EMPTY, authentication is DISABLED (local dev only) and
   * a warning is logged. Set a strong value via .env to protect the dashboard.
   */
  ADMIN_PASSWORD: z.string().default(""),
  /** Comma-separated jobs to auto-start disabled (e.g. "ai-qualification"). */
  JOBS_DISABLED: z.string().default(""),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema> & {
  /** Parsed list form of WEB_ORIGIN. */
  webOrigins: string[];
};

function parseEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const webOrigins = parsed.data.WEB_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...parsed.data, webOrigins };
}

/** Validated, immutable environment configuration. */
export const env: Env = parseEnv();

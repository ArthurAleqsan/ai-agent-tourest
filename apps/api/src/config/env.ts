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
  OLLAMA_MODEL: z.string().min(1).default("llama3.1:8b"),
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

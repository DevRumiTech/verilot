import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  APP_ORIGIN: z
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
      message: "APP_ORIGIN must use HTTP or HTTPS.",
    })
    .transform((value) => new URL(value).origin),
  DATA_HASH_SECRET: z.string().min(32),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  JWT_SECRET: z.string().min(32),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4_000),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().max(10_000).default(20),
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce.number().int().positive().max(86_400).default(900),
  RATE_LIMIT_PARTNER_MAX: z.coerce.number().int().positive().max(100_000).default(120),
  RATE_LIMIT_PARTNER_WINDOW_SECONDS: z.coerce.number().int().positive().max(86_400).default(60),
  RATE_LIMIT_VERIFICATION_MAX: z.coerce.number().int().positive().max(100_000).default(60),
  RATE_LIMIT_VERIFICATION_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(60),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(8),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = Object.freeze(result.data);

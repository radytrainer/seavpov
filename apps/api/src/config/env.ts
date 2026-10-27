import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: bool.default(false),
  SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .default(168),
  API_DOCS_ENABLED: bool.default(true),
  /**
   * Sign-in / password requests per client IP per minute. Students in one school often share a
   * public IP, so this is moderate; per-account lockout is the main brute-force defence.
   */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(30),
  /** All other API requests per session (or per IP when signed out) per minute. */
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(10).max(100_000).default(600),
  SMTP_HOST: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Reading Tracker <no-reply@example.edu>'),
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates process.env; fails fast with a readable message (no secret values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production (HTTPS is required).');
  }
  return env;
}

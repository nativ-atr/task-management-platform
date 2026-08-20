import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://task_platform:task_platform@localhost:5432/task_platform'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  REQUEST_BODY_LIMIT: z.string().default('256kb'),
  IDEMPOTENCY_RETENTION_HOURS: z.coerce.number().positive().default(24),
  IDEMPOTENCY_LEASE_SECONDS: z.coerce.number().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  return envSchema.parse(process.env);
}

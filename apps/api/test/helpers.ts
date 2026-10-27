import path from 'node:path';
import { config } from 'dotenv';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createPrismaClient } from '../src/plugins/prisma';
import { invalidateSettings } from '../src/lib/settings';
import type { PrismaClient } from '../src/generated/prisma/client';

config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
}

export async function createTestApp(
  options: Partial<Pick<Parameters<typeof buildApp>[0], 'rateLimit' | 'mailer' | 'clock'>> = {},
): Promise<TestContext> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    LOG_LEVEL: 'silent',
    API_DOCS_ENABLED: 'false',
    AUTH_RATE_LIMIT_PER_MINUTE: '10',
  });
  const prisma = createPrismaClient(env.DATABASE_URL, 5);
  const app = await buildApp({ env, prisma, logger: false, rateLimit: false, ...options });
  await app.ready();
  return { app, prisma };
}

/** Removes all rows from application tables and restores default settings. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  await prisma.systemSettings.create({ data: { id: 1 } });
  invalidateSettings();
}

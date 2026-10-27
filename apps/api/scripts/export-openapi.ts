/**
 * Writes the OpenAPI document generated from the route schemas to docs/openapi.json.
 * Usage: pnpm --filter @rt/api openapi  (needs DATABASE_URL; no queries are made)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createPrismaClient } from '../src/plugins/prisma';

const env = loadEnv({ ...process.env, API_DOCS_ENABLED: 'true', LOG_LEVEL: 'silent' });
const prisma = createPrismaClient(env.DATABASE_URL, 1);
const app = await buildApp({ env, prisma, logger: false });
await app.ready();
const spec = app.swagger();
const out = path.resolve(import.meta.dirname, '../../../docs/openapi.json');
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
console.warn(`OpenAPI written to ${out} (${Object.keys(spec.paths ?? {}).length} paths)`);
await app.close();

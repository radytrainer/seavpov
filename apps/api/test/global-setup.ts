import { execSync } from 'node:child_process';
import path from 'node:path';
import { config } from 'dotenv';

/** Applies all migrations to the dedicated test database before the suite runs. */
export default function setup() {
  config({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must be set to run integration tests');
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL (tests truncate tables)');
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

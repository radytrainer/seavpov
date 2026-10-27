import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs in e2e/ run with `pnpm test:e2e`.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'] },
});

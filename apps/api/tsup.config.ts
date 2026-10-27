import { defineConfig } from 'tsup';

// Bundles the API (including workspace @rt/shared and the generated Prisma client) into dist/.
// npm dependencies stay external and are installed in the production image.
export default defineConfig({
  entry: { server: 'src/server.ts', 'seed-production': 'prisma/seed-production.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@rt/shared'],
});

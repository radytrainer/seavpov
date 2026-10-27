import { buildApp } from './app';
import { loadEnv } from './config/env';
import { createPrismaClient } from './plugins/prisma';

async function main() {
  const env = loadEnv();
  const prisma = createPrismaClient(env.DATABASE_URL, env.DATABASE_POOL_MAX);
  const app = await buildApp({ env, prisma });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

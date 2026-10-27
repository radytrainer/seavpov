import fp from 'fastify-plugin';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export function createPrismaClient(connectionString: string, poolMax: number): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: poolMax,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Guard against runaway queries; analytics queries are well below this.
    statement_timeout: 15_000,
  });
  return new PrismaClient({ adapter });
}

export const prismaPlugin = fp<{ prisma: PrismaClient }>(async (app, opts) => {
  app.decorate('prisma', opts.prisma);
  app.addHook('onClose', async () => {
    await opts.prisma.$disconnect();
  });
});

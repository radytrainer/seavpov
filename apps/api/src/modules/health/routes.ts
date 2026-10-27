import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

/** Liveness (process up) and readiness (database reachable) probes. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['health'],
        response: { 200: z.object({ status: z.literal('ok'), uptimeSeconds: z.number() }) },
      },
    },
    async () => ({ status: 'ok' as const, uptimeSeconds: Math.round(process.uptime()) }),
  );

  app.get(
    '/health/ready',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['health'],
        response: {
          200: z.object({ status: z.literal('ok'), database: z.literal('up') }),
          503: z.object({ status: z.literal('error'), database: z.literal('down') }),
        },
      },
    },
    async (request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
        return { status: 'ok' as const, database: 'up' as const };
      } catch (err) {
        request.log.error({ err }, 'Readiness check failed');
        return reply.status(503).send({ status: 'error' as const, database: 'down' as const });
      }
    },
  );
};

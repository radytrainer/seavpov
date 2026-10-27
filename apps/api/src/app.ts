import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env';
import type { PrismaClient } from './generated/prisma/client';
import { registerErrorHandler } from './lib/errors';
import { prismaPlugin } from './plugins/prisma';
import { csrfPlugin } from './plugins/csrf';
import { SESSION_COOKIE, authPlugin } from './plugins/auth';
import { sha256 } from './lib/security';
import { createMailer, type Mailer } from './lib/mailer';
import { healthRoutes } from './modules/health/routes';
import { authRoutes } from './modules/auth/routes';
import { adminUserRoutes } from './modules/users/routes';
import { adminCategoryRoutes, categoryRoutes } from './modules/categories/routes';
import { libraryBookRoutes } from './modules/library-books/routes';
import { studentBookRoutes } from './modules/student-books/routes';
import { readingSessionRoutes } from './modules/reading-sessions/routes';
import { reflectionRoutes } from './modules/reflections/routes';
import { analyticsRoutes, goalRoutes } from './modules/analytics/routes';
import { trainerRoutes } from './modules/trainer/routes';
import { reportRoutes } from './modules/reports/routes';
import { adminRoutes } from './modules/admin/routes';

declare module 'fastify' {
  interface FastifyInstance {
    config: Env;
    mailer: Mailer;
    /** Trusted server clock for all reading timestamps (overridable in tests). */
    now: () => Date;
  }
}

export interface BuildAppOptions {
  env: Env;
  prisma: PrismaClient;
  /** Disable request logging (tests). */
  logger?: boolean;
  /** Disable rate limiting (tests that perform many logins). */
  rateLimit?: boolean;
  /** Override the mailer (tests capture reset emails). */
  mailer?: Mailer;
  /** Override the clock (tests simulate elapsed reading time). */
  clock?: () => Date;
}

export async function buildApp({
  env,
  prisma,
  logger = true,
  rateLimit: rateLimitEnabled = true,
  mailer,
  clock = () => new Date(),
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: env.LOG_LEVEL,
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
              '*.password',
              '*.currentPassword',
              '*.newPassword',
              '*.token',
            ],
            censor: '[redacted]',
          },
        }
      : false,
    trustProxy: env.NODE_ENV === 'production',
    bodyLimit: 2 * 1024 * 1024, // 2 MB: enough for CSV imports, nothing larger is accepted
    requestTimeout: 30_000,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false }); // CSP is set by the web app/Nginx
  await app.register(cookie);
  app.decorate('config', env);
  app.decorate('mailer', mailer ?? createMailer(env, app.log));
  app.decorate('now', clock);

  // Without the plugin, per-route `config.rateLimit` settings are inert (used by tests).
  if (rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: env.GLOBAL_RATE_LIMIT_PER_MINUTE,
      timeWindow: '1 minute',
      // Signed-in requests are limited per session, so a whole school behind one NAT address
      // does not share a single budget; anonymous requests are limited per client IP
      // (trustProxy resolves the real IP behind Nginx).
      keyGenerator: (request) => {
        const token = request.cookies?.[SESSION_COOKIE];
        return token ? `s:${sha256(token)}` : `ip:${request.ip}`;
      },
    });
  }
  await app.register(prismaPlugin, { prisma });
  await app.register(csrfPlugin, { appOrigin: env.APP_ORIGIN });
  await app.register(authPlugin, {
    cookieSecure: env.COOKIE_SECURE,
    sessionTtlHours: env.SESSION_TTL_HOURS,
  });

  if (env.API_DOCS_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Physical Book Reading Tracker API',
          version: '1.0.0',
          description:
            'REST API for tracking physical book reading. Authenticate via POST /api/v1/auth/login; ' +
            'state-changing requests require the header `X-Requested-With: fetch`.',
        },
        components: {
          securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'rt_session' } },
        },
        security: [{ session: [] }],
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }

  await app.register(healthRoutes);
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(adminUserRoutes, { prefix: '/admin' });
      await api.register(adminCategoryRoutes, { prefix: '/admin' });
      await api.register(adminRoutes, { prefix: '/admin' });
      await api.register(categoryRoutes, { prefix: '/categories' });
      await api.register(libraryBookRoutes, { prefix: '/library-books' });
      await api.register(studentBookRoutes, { prefix: '/student-books' });
      await api.register(readingSessionRoutes, { prefix: '/reading-sessions' });
      await api.register(reflectionRoutes, { prefix: '/reflections' });
      await api.register(analyticsRoutes, { prefix: '/analytics' });
      await api.register(goalRoutes, { prefix: '/reading-goals' });
      await api.register(trainerRoutes, { prefix: '/trainer' });
      await api.register(reportRoutes('TRAINER'), { prefix: '/trainer/reports' });
      await api.register(reportRoutes('ADMIN'), { prefix: '/admin/reports' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}

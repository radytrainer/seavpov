import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  GENDERS,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@rt/shared';
import { SESSION_COOKIE, authOf, requireAuth } from '../../plugins/auth';
import { userDtoSchema, userSelect } from '../users/dto';
import * as auth from './service';

const ok = z.object({ data: z.object({ ok: z.literal(true) }) });
const userResponse = z.object({ data: userDtoSchema });

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Strict per-IP limits on credential endpoints (in addition to per-account lockout). */
  const authRateLimit = {
    rateLimit: { max: app.config.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' },
  };

  app.post(
    '/login',
    {
      config: authRateLimit,
      schema: { tags: ['auth'], body: loginSchema, response: { 200: userResponse } },
    },
    async (request, reply) => {
      const { token, user } = await auth.login(
        app,
        request,
        request.body.identifier,
        request.body.password,
      );
      reply.setCookie(
        SESSION_COOKIE,
        token,
        app.sessionCookieOptions(app.config.SESSION_TTL_HOURS * 3600),
      );
      return { data: user };
    },
  );

  app.get(
    '/registration',
    {
      schema: {
        tags: ['auth'],
        description:
          'Whether students may create their own accounts, and the classes to choose from.',
      },
    },
    async () => ({ data: await auth.registrationInfo(app) }),
  );

  app.post(
    '/register',
    {
      config: authRateLimit,
      schema: { tags: ['auth'], body: registerSchema, response: { 201: userResponse } },
    },
    async (request, reply) => {
      const { token, user } = await auth.register(app, request, request.body);
      reply.setCookie(
        SESSION_COOKIE,
        token,
        app.sessionCookieOptions(app.config.SESSION_TTL_HOURS * 3600),
      );
      return reply.status(201).send({ data: user });
    },
  );

  app.post(
    '/logout',
    { schema: { tags: ['auth'], response: { 200: ok } } },
    async (request, reply) => {
      if (request.auth) await auth.logout(app, request.auth.sessionId);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return { data: { ok: true as const } };
    },
  );

  app.get(
    '/me',
    { preHandler: requireAuth(), schema: { tags: ['auth'], response: { 200: userResponse } } },
    async (request) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: authOf(request).userId },
        select: userSelect,
      });
      return { data: user };
    },
  );

  app.patch(
    '/me',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        description: 'Update the fields a user may change on their own profile.',
        body: z.object({
          email: z
            .email('Enter a valid email address')
            .max(254)
            .transform((v) => v.toLowerCase())
            .nullable()
            .optional(),
          gender: z.enum(GENDERS).nullable().optional(),
        }),
        response: { 200: userResponse },
      },
    },
    async (request) => {
      const user = await app.prisma.user.update({
        where: { id: authOf(request).userId },
        data: request.body,
        select: userSelect,
      });
      return { data: user };
    },
  );

  app.post(
    '/change-password',
    {
      preHandler: requireAuth(),
      config: authRateLimit,
      schema: { tags: ['auth'], body: changePasswordSchema, response: { 200: ok } },
    },
    async (request) => {
      const ctx = authOf(request);
      await auth.changePassword(
        app,
        request,
        ctx.userId,
        ctx.sessionId,
        request.body.currentPassword,
        request.body.newPassword,
      );
      return { data: { ok: true as const } };
    },
  );

  app.post(
    '/forgot-password',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: { tags: ['auth'], body: forgotPasswordSchema, response: { 202: ok } },
    },
    async (request, reply) => {
      await auth.requestPasswordReset(app, request, request.body.email);
      return reply.status(202).send({ data: { ok: true as const } });
    },
  );

  app.post(
    '/reset-password',
    {
      config: authRateLimit,
      schema: { tags: ['auth'], body: resetPasswordSchema, response: { 200: ok } },
    },
    async (request) => {
      await auth.resetPassword(app, request, request.body.token, request.body.newPassword);
      return { data: { ok: true as const } };
    },
  );
};

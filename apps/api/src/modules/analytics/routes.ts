import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isoDateSchema, readingGoalSchema } from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { assertCanViewStudent } from '../../lib/access';
import { badRequest } from '../../lib/errors';
import * as analytics from './service';
import * as goals from '../goals/service';

/** /api/v1/analytics — computed on demand from completed sessions (see docs/METRICS.md). */
export const analyticsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      preHandler: requireAuth('STUDENT'),
      schema: { tags: ['analytics'], description: 'Dashboard summary for the signed-in student.' },
    },
    async (request) => ({ data: await analytics.studentSummary(app, authOf(request).userId) }),
  );

  app.get(
    '/reading-trends',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['analytics'],
        querystring: z
          .object({
            from: isoDateSchema.optional(),
            to: isoDateSchema.optional(),
            granularity: z.enum(['day', 'week', 'month']).default('day'),
            studentId: z.uuid().optional(),
          })
          .refine((q) => !q.from || !q.to || q.from <= q.to, {
            path: ['from'],
            message: 'Start date must be before end date',
          }),
      },
    },
    async (request) => {
      const actor = authOf(request);
      const studentId = request.query.studentId ?? actor.userId;
      if (actor.role !== 'STUDENT' && !request.query.studentId) {
        throw badRequest('studentId is required');
      }
      await assertCanViewStudent(app.prisma, actor, studentId);
      const { from, to } = request.query;
      if (from && to && Date.parse(to) - Date.parse(from) > 731 * 86_400_000) {
        throw badRequest('Choose a range of at most two years');
      }
      return { data: await analytics.readingTrends(app, studentId, request.query) };
    },
  );
};

/** /api/v1/reading-goals — the student's own goals. */
export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth('STUDENT'));

  app.get('/', { schema: { tags: ['goals'] } }, async (request) => ({
    data: await goals.getGoals(app, authOf(request).userId),
  }));

  app.post(
    '/',
    {
      schema: {
        tags: ['goals'],
        body: readingGoalSchema,
        response: { 201: z.object({ data: goals.goalDto }) },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send({ data: await goals.setGoal(app, authOf(request).userId, request.body) }),
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['goals'],
        params: z.object({ id: z.uuid() }),
        body: readingGoalSchema,
        response: { 200: z.object({ data: goals.goalDto }) },
      },
    },
    async (request) => ({
      data: await goals.updateGoal(app, authOf(request).userId, request.params.id, request.body),
    }),
  );
};

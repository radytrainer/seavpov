import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isoDateSchema, paginationQuerySchema } from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import * as trainer from './service';

const rangeQuery = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  classId: z.uuid().optional(),
  generationId: z.uuid().optional(),
};

/**
 * /api/v1/trainer — oversight of assigned students. Admins may use the same endpoints with
 * institution-wide scope.
 */
export const trainerRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth('TRAINER', 'ADMIN'));

  app.get(
    '/overview',
    { schema: { tags: ['trainer'], querystring: z.object(rangeQuery) } },
    async (request) => ({
      data: await trainer.overview(app, authOf(request), request.query),
    }),
  );

  app.get('/filters', { schema: { tags: ['trainer'] } }, async (request) => ({
    data: await trainer.filterOptions(app, authOf(request)),
  }));

  app.get(
    '/students',
    {
      schema: {
        tags: ['trainer'],
        querystring: paginationQuerySchema.extend({
          ...rangeQuery,
          search: z.string().trim().max(100).optional(),
          inactiveOnly: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
          unassigned: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
          accountStatus: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
        }),
      },
    },
    async (request) => {
      const { items, total, range } = await trainer.listStudents(
        app,
        authOf(request),
        request.query,
      );
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total, range },
      };
    },
  );

  app.get(
    '/students/:id/summary',
    { schema: { tags: ['trainer'], params: z.object({ id: z.uuid() }) } },
    async (request) => ({
      data: await trainer.studentDetail(app, authOf(request), request.params.id),
    }),
  );
};

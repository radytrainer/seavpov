import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  READING_STATUSES,
  STUDENT_BOOK_SORTS,
  paginationQuerySchema,
  studentBookCreateSchema,
  studentBookStatusSchema,
  studentBookUpdateSchema,
} from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { listResponse } from '../../lib/pagination';
import * as sb from './service';

const idParams = z.object({ id: z.uuid() });
const one = z.object({ data: sb.studentBookDto });

/** /api/v1/student-books — a student's personal reading records. */
export const studentBookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['student-books'],
        description:
          'Students see their own records; trainers/admins may pass studentId for authorized students.',
        querystring: paginationQuerySchema.extend({
          status: z.enum(READING_STATUSES).optional(),
          categoryId: z.uuid().optional(),
          search: z.string().trim().max(100).optional(),
          sort: z.enum(STUDENT_BOOK_SORTS).default('recent'),
          archived: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
          studentId: z.uuid().optional(),
        }),
        response: { 200: listResponse(sb.studentBookDto) },
      },
    },
    async (request) => {
      const { items, total } = await sb.listStudentBooks(app, authOf(request), request.query);
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total },
      };
    },
  );

  app.post(
    '/',
    {
      preHandler: requireAuth('STUDENT'),
      schema: { tags: ['student-books'], body: studentBookCreateSchema, response: { 201: one } },
    },
    async (request, reply) => {
      const row = await sb.createStudentBook(app, request, authOf(request), request.body);
      return reply.status(201).send({ data: row });
    },
  );

  app.get(
    '/:id',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['student-books'],
        params: idParams,
        response: {
          200: z.object({
            data: sb.studentBookDto.extend({
              stats: z.object({ sessionCount: z.number(), totalSeconds: z.number() }),
              activeSessionId: z.string().nullable(),
            }),
          }),
        },
      },
    },
    async (request) => ({
      data: await sb.getStudentBookDetail(app, authOf(request), request.params.id),
    }),
  );

  app.patch(
    '/:id',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['student-books'],
        params: idParams,
        body: studentBookUpdateSchema,
        response: { 200: one },
      },
    },
    async (request) => ({
      data: await sb.updateStudentBook(app, authOf(request), request.params.id, request.body),
    }),
  );

  app.patch(
    '/:id/status',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['student-books'],
        params: idParams,
        body: studentBookStatusSchema,
        response: { 200: one },
      },
    },
    async (request) => ({
      data: await sb.updateStudentBookStatus(
        app,
        authOf(request),
        request.params.id,
        request.body.status,
      ),
    }),
  );
};

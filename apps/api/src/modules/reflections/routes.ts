import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createReflectionSchema,
  feedbackSchema,
  isoDateSchema,
  paginationQuerySchema,
  updateReflectionSchema,
} from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { listResponse } from '../../lib/pagination';
import * as reflections from './service';
import { reflectionPdf, studentReflectionsPdf } from './pdf';

const idParams = z.object({ id: z.uuid() });
const one = z.object({ data: reflections.reflectionDto });

function sendPdf(reply: FastifyReply, buffer: Buffer, filename: string) {
  return reply
    .header('content-type', 'application/pdf')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('cache-control', 'no-store')
    .send(buffer);
}

/** /api/v1/reflections — student reflections and trainer feedback. */
export const reflectionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['reflections'],
        querystring: paginationQuerySchema.extend({
          search: z.string().trim().max(100).optional(),
          studentBookId: z.uuid().optional(),
          studentId: z.uuid().optional(),
          classId: z.uuid().optional(),
          tag: z.string().trim().max(40).optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
          needsFeedback: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
        }),
        response: { 200: listResponse(reflections.reflectionDto) },
      },
    },
    async (request) => {
      const { items, total } = await reflections.listReflections(
        app,
        authOf(request),
        request.query,
      );
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total },
      };
    },
  );

  app.get(
    '/export.pdf',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['reflections'],
        description:
          'All reflections of one student as a PDF. Students: their own; trainers/admins: studentId required.',
        querystring: z.object({
          studentId: z.uuid().optional(),
          studentBookId: z.uuid().optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
        }),
      },
    },
    async (request, reply) => {
      const { buffer, filename } = await studentReflectionsPdf(
        app,
        request,
        authOf(request),
        request.query,
      );
      return sendPdf(reply, buffer, filename);
    },
  );

  app.get(
    '/:id/pdf',
    {
      preHandler: requireAuth(),
      schema: { tags: ['reflections'], params: idParams },
    },
    async (request, reply) => {
      const { buffer, filename } = await reflectionPdf(
        app,
        request,
        authOf(request),
        request.params.id,
      );
      return sendPdf(reply, buffer, filename);
    },
  );

  app.post(
    '/',
    {
      preHandler: requireAuth('STUDENT'),
      schema: { tags: ['reflections'], body: createReflectionSchema, response: { 201: one } },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send({ data: await reflections.createReflection(app, authOf(request), request.body) }),
  );

  app.get(
    '/:id',
    {
      preHandler: requireAuth(),
      schema: { tags: ['reflections'], params: idParams, response: { 200: one } },
    },
    async (request) => ({
      data: await reflections.getReflection(app, authOf(request), request.params.id),
    }),
  );

  app.patch(
    '/:id',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['reflections'],
        params: idParams,
        body: updateReflectionSchema,
        response: { 200: one },
      },
    },
    async (request) => ({
      data: await reflections.updateReflection(
        app,
        authOf(request),
        request.params.id,
        request.body,
      ),
    }),
  );

  app.post(
    '/:id/feedback',
    {
      preHandler: requireAuth('TRAINER', 'ADMIN'),
      schema: {
        tags: ['reflections'],
        params: idParams,
        body: feedbackSchema,
        response: { 201: one },
      },
    },
    async (request, reply) =>
      reply.status(201).send({
        data: await reflections.addFeedback(
          app,
          request,
          authOf(request),
          request.params.id,
          request.body.body,
        ),
      }),
  );

  app.patch(
    '/:id/feedback/:feedbackId',
    {
      preHandler: requireAuth('TRAINER', 'ADMIN'),
      schema: {
        tags: ['reflections'],
        params: z.object({ id: z.uuid(), feedbackId: z.uuid() }),
        body: feedbackSchema,
        response: { 200: one },
      },
    },
    async (request) => ({
      data: await reflections.updateFeedback(
        app,
        authOf(request),
        request.params.id,
        request.params.feedbackId,
        request.body.body,
      ),
    }),
  );
};

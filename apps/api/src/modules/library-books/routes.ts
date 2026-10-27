import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { libraryBookInputSchema, libraryBookUpdateSchema, paginationQuerySchema } from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { listResponse } from '../../lib/pagination';
import * as books from './service';

const idParams = z.object({ id: z.uuid() });
const one = z.object({ data: books.libraryBookDto });

/** /api/v1/library-books — the shared physical-book catalog. */
export const libraryBookRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['library-books'],
        querystring: paginationQuerySchema.extend({
          search: z.string().trim().max(100).optional(),
          categoryId: z.uuid().optional(),
          status: z.enum(['APPROVED', 'PENDING']).optional(),
        }),
        response: { 200: listResponse(books.libraryBookDto) },
      },
    },
    async (request) => {
      const { items, total } = await books.listLibraryBooks(app, authOf(request), request.query);
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total },
      };
    },
  );

  app.get(
    '/:id',
    {
      preHandler: requireAuth(),
      schema: { tags: ['library-books'], params: idParams, response: { 200: one } },
    },
    async (request) => ({
      data: await books.getLibraryBook(app, authOf(request), request.params.id),
    }),
  );

  app.post(
    '/',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['library-books'],
        description: 'Students create PENDING entries; administrators create APPROVED entries.',
        body: libraryBookInputSchema,
        response: { 201: one },
      },
    },
    async (request, reply) => {
      const book = await books.createLibraryBook(
        app.prisma,
        request,
        authOf(request),
        request.body,
      );
      return reply.status(201).send({ data: book });
    },
  );

  app.patch(
    '/:id',
    {
      preHandler: requireAuth('ADMIN'),
      schema: {
        tags: ['library-books'],
        params: idParams,
        body: libraryBookUpdateSchema,
        response: { 200: one },
      },
    },
    async (request) => ({
      data: await books.updateLibraryBook(
        app,
        request,
        authOf(request),
        request.params.id,
        request.body,
      ),
    }),
  );

  app.post(
    '/:id/merge',
    {
      preHandler: requireAuth('ADMIN'),
      schema: {
        tags: ['library-books'],
        params: idParams,
        body: z.object({ targetId: z.uuid() }),
        response: { 200: z.object({ data: z.object({ moved: z.number() }) }) },
      },
    },
    async (request) => ({
      data: await books.mergeLibraryBook(app, request, request.params.id, request.body.targetId),
    }),
  );
};

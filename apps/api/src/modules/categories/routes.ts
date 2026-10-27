import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { categoryInputSchema } from '@rt/shared';
import { requireAuth } from '../../plugins/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';

const categoryDto = z.object({
  id: z.string(),
  name: z.string(),
  archivedAt: z.date().nullable(),
  bookCount: z.number().optional(),
});

/** GET /api/v1/categories — active categories for pickers (any signed-in user). */
export const categoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/',
    {
      preHandler: requireAuth(),
      schema: { tags: ['categories'], response: { 200: z.object({ data: z.array(categoryDto) }) } },
    },
    async () => ({
      data: await app.prisma.bookCategory.findMany({
        where: { archivedAt: null },
        select: { id: true, name: true, archivedAt: true },
        orderBy: { name: 'asc' },
      }),
    }),
  );
};

/** /api/v1/admin/categories — management (archive instead of delete). */
export const adminCategoryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth('ADMIN'));

  app.get(
    '/categories',
    { schema: { tags: ['admin'], response: { 200: z.object({ data: z.array(categoryDto) }) } } },
    async () => {
      const rows = await app.prisma.bookCategory.findMany({
        select: { id: true, name: true, archivedAt: true, _count: { select: { books: true } } },
        orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      });
      return { data: rows.map(({ _count, ...c }) => ({ ...c, bookCount: _count.books })) };
    },
  );

  app.post(
    '/categories',
    {
      schema: {
        tags: ['admin'],
        body: categoryInputSchema,
        response: { 201: z.object({ data: categoryDto }) },
      },
    },
    async (request, reply) => {
      const category = await app.prisma.bookCategory.create({
        data: { name: request.body.name },
        select: { id: true, name: true, archivedAt: true },
      });
      await audit(app.prisma, request, {
        action: 'category.created',
        entityType: 'category',
        entityId: category.id,
        metadata: { name: category.name },
      });
      return reply.status(201).send({ data: category });
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ id: z.uuid() }),
        body: categoryInputSchema.partial().extend({ archived: z.boolean().optional() }),
        response: { 200: z.object({ data: categoryDto }) },
      },
    },
    async (request) => {
      const exists = await app.prisma.bookCategory.findUnique({ where: { id: request.params.id } });
      if (!exists) throw notFound('Category');
      const { archived, name } = request.body;
      const category = await app.prisma.bookCategory.update({
        where: { id: request.params.id },
        data: {
          name,
          archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
        },
        select: { id: true, name: true, archivedAt: true },
      });
      await audit(app.prisma, request, {
        action: archived
          ? 'category.archived'
          : archived === false
            ? 'category.restored'
            : 'category.updated',
        entityType: 'category',
        entityId: category.id,
        metadata: { name: category.name },
      });
      return { data: category };
    },
  );
};

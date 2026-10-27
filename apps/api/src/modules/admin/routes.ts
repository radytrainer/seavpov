import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  classInputSchema,
  generationInputSchema,
  isoDateSchema,
  paginationQuerySchema,
  settingsSchema,
} from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import { requireAuth } from '../../plugins/auth';
import { audit } from '../../lib/audit';
import { notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';
import { getSettings, invalidateSettings } from '../../lib/settings';
import { importStudents } from './import';

const idParams = z.object({ id: z.uuid() });
const archived = z.object({ archived: z.boolean().optional() });
const archivedAt = (v?: boolean) => (v === undefined ? undefined : v ? new Date() : null);

/** /api/v1/admin — organisation, settings, audit log, CSV import, overview. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth('ADMIN'));

  // ----- Overview ------------------------------------------------------------
  app.get('/overview', { schema: { tags: ['admin'] } }, async () => {
    const [roles, inactiveAccounts, pendingBooks, classes] = await Promise.all([
      app.prisma.user.groupBy({
        by: ['role'],
        where: { status: 'ACTIVE' },
        _count: { _all: true },
      }),
      app.prisma.user.count({ where: { status: 'INACTIVE' } }),
      app.prisma.libraryBook.count({ where: { status: 'PENDING', archivedAt: null } }),
      app.prisma.class.count({ where: { archivedAt: null } }),
    ]);
    const count = (r: string) => roles.find((x) => x.role === r)?._count._all ?? 0;
    return {
      data: {
        students: count('STUDENT'),
        trainers: count('TRAINER'),
        admins: count('ADMIN'),
        inactiveAccounts,
        pendingBooks,
        classes,
      },
    };
  });

  // ----- Generations ------------------------------------------------------
  app.get('/generations', { schema: { tags: ['admin'] } }, async () => ({
    data: await app.prisma.generation.findMany({
      select: {
        id: true,
        name: true,
        startYear: true,
        archivedAt: true,
        _count: { select: { classes: true } },
      },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    }),
  }));

  app.post(
    '/generations',
    { schema: { tags: ['admin'], body: generationInputSchema } },
    async (request, reply) => {
      const g = await app.prisma.generation.create({ data: request.body });
      await audit(app.prisma, request, {
        action: 'generation.created',
        entityType: 'generation',
        entityId: g.id,
        metadata: { name: g.name },
      });
      return reply.status(201).send({ data: g });
    },
  );

  app.patch(
    '/generations/:id',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        body: generationInputSchema.partial().merge(archived),
      },
    },
    async (request) => {
      if (!(await app.prisma.generation.findUnique({ where: { id: request.params.id } })))
        throw notFound('Generation');
      const { archived: a, ...data } = request.body;
      const g = await app.prisma.generation.update({
        where: { id: request.params.id },
        data: { ...data, archivedAt: archivedAt(a) },
      });
      await audit(app.prisma, request, {
        action: a ? 'generation.archived' : 'generation.updated',
        entityType: 'generation',
        entityId: g.id,
        metadata: { fields: Object.keys(request.body) },
      });
      return { data: g };
    },
  );

  // ----- Classes -----------------------------------------------------------
  app.get('/classes', { schema: { tags: ['admin'] } }, async () => ({
    data: await app.prisma.class.findMany({
      select: {
        id: true,
        name: true,
        archivedAt: true,
        generation: { select: { id: true, name: true } },
        _count: { select: { students: true } },
      },
      orderBy: [
        { archivedAt: { sort: 'asc', nulls: 'first' } },
        { generation: { name: 'asc' } },
        { name: 'asc' },
      ],
    }),
  }));

  app.post(
    '/classes',
    { schema: { tags: ['admin'], body: classInputSchema } },
    async (request, reply) => {
      if (!(await app.prisma.generation.findUnique({ where: { id: request.body.generationId } })))
        throw notFound('Generation');
      const c = await app.prisma.class.create({ data: request.body });
      await audit(app.prisma, request, {
        action: 'class.created',
        entityType: 'class',
        entityId: c.id,
        metadata: { name: c.name },
      });
      return reply.status(201).send({ data: c });
    },
  );

  app.patch(
    '/classes/:id',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        body: classInputSchema.partial().merge(archived),
      },
    },
    async (request) => {
      if (!(await app.prisma.class.findUnique({ where: { id: request.params.id } })))
        throw notFound('Class');
      const { archived: a, ...data } = request.body;
      const c = await app.prisma.class.update({
        where: { id: request.params.id },
        data: { ...data, archivedAt: archivedAt(a) },
      });
      await audit(app.prisma, request, {
        action: a ? 'class.archived' : 'class.updated',
        entityType: 'class',
        entityId: c.id,
        metadata: { fields: Object.keys(request.body) },
      });
      return { data: c };
    },
  );

  // ----- Settings ----------------------------------------------------------
  app.get('/settings', { schema: { tags: ['admin'] } }, async () => ({
    data: await getSettings(app.prisma),
  }));

  app.patch('/settings', { schema: { tags: ['admin'], body: settingsSchema } }, async (request) => {
    const before = await app.prisma.systemSettings.findUniqueOrThrow({ where: { id: 1 } });
    const after = await app.prisma.systemSettings.update({ where: { id: 1 }, data: request.body });
    invalidateSettings();
    const changes = Object.fromEntries(
      Object.keys(request.body)
        .filter((k) => before[k as keyof typeof before] !== after[k as keyof typeof after])
        .map((k) => [
          k,
          { from: before[k as keyof typeof before], to: after[k as keyof typeof after] },
        ]),
    );
    await audit(app.prisma, request, {
      action: 'settings.updated',
      entityType: 'settings',
      entityId: '1',
      metadata: JSON.parse(JSON.stringify(changes)),
    });
    return { data: after };
  });

  // ----- Audit log -----------------------------------------------------------
  app.get(
    '/audit-logs',
    {
      schema: {
        tags: ['admin'],
        querystring: paginationQuerySchema.extend({
          action: z.string().trim().max(80).optional(),
          entityType: z.string().trim().max(50).optional(),
          actorId: z.uuid().optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
        }),
      },
    },
    async (request) => {
      const q = request.query;
      const where: Prisma.AuditLogWhereInput = {
        action: q.action ? { startsWith: q.action } : undefined,
        entityType: q.entityType,
        actorId: q.actorId,
        createdAt:
          q.from || q.to
            ? {
                gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
                lt: q.to ? new Date(Date.parse(`${q.to}T00:00:00Z`) + 86_400_000) : undefined,
              }
            : undefined,
      };
      const [items, total] = await app.prisma.$transaction([
        app.prisma.auditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            ip: true,
            createdAt: true,
            actor: { select: { id: true, fullName: true, username: true } },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...pageArgs(q),
        }),
        app.prisma.auditLog.count({ where }),
      ]);
      return { data: items, meta: { page: q.page, pageSize: q.pageSize, total } };
    },
  );

  // ----- CSV import --------------------------------------------------------
  app.post(
    '/users/import',
    {
      schema: {
        tags: ['admin'],
        description:
          'Columns: student_id, full_name, username (required); email, gender, generation, class (optional). ' +
          'Use dryRun to validate only. Nothing is created unless every row is valid.',
        body: z.object({
          csv: z.string().min(1).max(1_500_000),
          dryRun: z.boolean().default(true),
        }),
      },
    },
    async (request) => ({
      data: await importStudents(app, request, request.body.csv, request.body.dryRun),
    }),
  );
};

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ROLES,
  USER_STATUSES,
  adminCreateUserSchema,
  adminUpdateUserSchema,
  paginationQuerySchema,
} from '@rt/shared';
import { requireAuth } from '../../plugins/auth';
import { listResponse } from '../../lib/pagination';
import { notFound } from '../../lib/errors';
import { userDtoSchema, userSelect } from './dto';
import * as users from './service';

const idParams = z.object({ id: z.uuid() });

/** Administrator account management. Mounted at /api/v1/admin. */
export const adminUserRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAuth('ADMIN'));

  app.get(
    '/users',
    {
      schema: {
        tags: ['admin'],
        querystring: paginationQuerySchema.extend({
          role: z.enum(ROLES).optional(),
          status: z.enum(USER_STATUSES).optional(),
          classId: z.uuid().optional(),
          generationId: z.uuid().optional(),
          search: z.string().trim().max(100).optional(),
          unassigned: z
            .enum(['true', 'false'])
            .optional()
            .transform((v) => v === 'true'),
        }),
        response: {
          200: listResponse(userDtoSchema.extend({ assignedStudents: z.number() })),
        },
      },
    },
    async (request) => {
      const { items, total } = await users.listUsers(app, request.query);
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total },
      };
    },
  );

  app.get(
    '/users/:id',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        response: { 200: z.object({ data: userDtoSchema }) },
      },
    },
    async (request) => {
      const user = await app.prisma.user.findUnique({
        where: { id: request.params.id },
        select: userSelect,
      });
      if (!user) throw notFound('User');
      return { data: user };
    },
  );

  app.post(
    '/users',
    {
      schema: {
        tags: ['admin'],
        body: adminCreateUserSchema,
        response: {
          201: z.object({
            data: userDtoSchema,
            meta: z.object({ temporaryPassword: z.string().optional() }),
          }),
        },
      },
    },
    async (request, reply) => {
      const { user, temporaryPassword } = await users.createUser(app, request, request.body);
      return reply.status(201).send({ data: user, meta: { temporaryPassword } });
    },
  );

  app.patch(
    '/users/:id',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        body: adminUpdateUserSchema,
        response: { 200: z.object({ data: userDtoSchema }) },
      },
    },
    async (request) => ({
      data: await users.updateUser(app, request, request.params.id, request.body),
    }),
  );

  app.post(
    '/users/:id/reset-password',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        response: { 200: z.object({ data: z.object({ temporaryPassword: z.string() }) }) },
      },
    },
    async (request) => ({ data: await users.resetUserPassword(app, request, request.params.id) }),
  );

  app.get(
    '/trainers/:id/students',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        response: { 200: z.object({ data: z.array(userDtoSchema) }) },
      },
    },
    async (request) => ({ data: await users.listTrainerStudents(app, request.params.id) }),
  );

  app.post(
    '/trainers/:id/students',
    {
      schema: {
        tags: ['admin'],
        params: idParams,
        body: z
          .object({
            studentIds: z.array(z.uuid()).max(500).optional(),
            classId: z.uuid().optional(),
          })
          .refine((v) => (v.studentIds?.length ?? 0) > 0 || v.classId, {
            message: 'Choose students or a class',
          }),
        response: { 200: z.object({ data: z.object({ added: z.number() }) }) },
      },
    },
    async (request) => ({
      data: await users.assignStudents(app, request, request.params.id, request.body),
    }),
  );

  app.delete(
    '/trainers/:id/students/:studentId',
    {
      schema: {
        tags: ['admin'],
        params: z.object({ id: z.uuid(), studentId: z.uuid() }),
        response: { 200: z.object({ data: z.object({ ok: z.literal(true) }) }) },
      },
    },
    async (request) => {
      await users.unassignStudent(app, request, request.params.id, request.params.studentId);
      return { data: { ok: true as const } };
    },
  );
};

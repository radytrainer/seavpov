import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SESSION_SOURCES,
  finishSessionSchema,
  isoDateSchema,
  manualSessionSchema,
  paginationQuerySchema,
  startSessionSchema,
  updateSessionSchema,
} from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { listResponse } from '../../lib/pagination';
import * as sessions from './service';

const idParams = z.object({ id: z.uuid() });
const one = z.object({ data: sessions.sessionDto, meta: z.object({ serverNow: z.date() }) });

/** /api/v1/reading-sessions — timer state machine, manual entries and history. */
export const readingSessionRoutes: FastifyPluginAsyncZod = async (app) => {
  const wrap = (data: sessions.SessionDto) => ({ data, meta: { serverNow: app.now() } });

  app.get(
    '/',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['reading-sessions'],
        querystring: paginationQuerySchema.extend({
          studentId: z.uuid().optional(),
          studentBookId: z.uuid().optional(),
          from: isoDateSchema.optional(),
          to: isoDateSchema.optional(),
          source: z.enum(SESSION_SOURCES).optional(),
          includeCancelled: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        }),
        response: { 200: listResponse(sessions.sessionDto) },
      },
    },
    async (request) => {
      const { items, total } = await sessions.listSessions(app, authOf(request), request.query);
      return {
        data: items,
        meta: { page: request.query.page, pageSize: request.query.pageSize, total },
      };
    },
  );

  app.get(
    '/active',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['reading-sessions'],
        description: 'The current READING/PAUSED session, used to restore the timer after refresh.',
        response: {
          200: z.object({
            data: sessions.sessionDto.nullable(),
            meta: z.object({ serverNow: z.date() }),
          }),
        },
      },
    },
    async (request) => ({
      data: await sessions.getActiveSession(app, authOf(request)),
      meta: { serverNow: app.now() },
    }),
  );

  app.get(
    '/:id',
    {
      preHandler: requireAuth(),
      schema: { tags: ['reading-sessions'], params: idParams, response: { 200: one } },
    },
    async (request) => wrap(await sessions.getSession(app, authOf(request), request.params.id)),
  );

  app.post(
    '/start',
    {
      preHandler: requireAuth('STUDENT'),
      schema: { tags: ['reading-sessions'], body: startSessionSchema, response: { 201: one } },
    },
    async (request, reply) =>
      reply.status(201).send(wrap(await sessions.startSession(app, authOf(request), request.body))),
  );

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    const handler = {
      pause: sessions.pauseSession,
      resume: sessions.resumeSession,
      cancel: sessions.cancelSession,
    }[action];
    app.post(
      `/:id/${action}`,
      {
        preHandler: requireAuth('STUDENT'),
        schema: { tags: ['reading-sessions'], params: idParams, response: { 200: one } },
      },
      async (request) => wrap(await handler(app, authOf(request), request.params.id)),
    );
  }

  app.post(
    '/:id/finish',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['reading-sessions'],
        params: idParams,
        body: finishSessionSchema,
        response: { 200: one },
      },
    },
    async (request) =>
      wrap(await sessions.finishSession(app, authOf(request), request.params.id, request.body)),
  );

  app.post(
    '/manual',
    {
      preHandler: requireAuth('STUDENT'),
      schema: { tags: ['reading-sessions'], body: manualSessionSchema, response: { 201: one } },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          wrap(await sessions.createManualSession(app, request, authOf(request), request.body)),
        ),
  );

  app.post(
    '/:id/void',
    {
      preHandler: requireAuth('ADMIN'),
      schema: {
        tags: ['reading-sessions'],
        description:
          'Administrators only: exclude a session from all metrics (kept as CANCELLED; reason audited).',
        params: idParams,
        body: z.object({
          reason: z.string().trim().min(5, 'Give a short reason').max(300),
        }),
        response: { 200: one },
      },
    },
    async (request) =>
      wrap(await sessions.voidSession(app, request, request.params.id, request.body.reason)),
  );

  app.patch(
    '/:id',
    {
      preHandler: requireAuth('STUDENT'),
      schema: {
        tags: ['reading-sessions'],
        params: idParams,
        body: updateSessionSchema,
        response: { 200: one },
      },
    },
    async (request) =>
      wrap(
        await sessions.updateSession(
          app,
          request,
          authOf(request),
          request.params.id,
          request.body,
        ),
      ),
  );
};

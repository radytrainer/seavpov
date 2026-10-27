import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { isoDateSchema } from '@rt/shared';
import { authOf, requireAuth } from '../../plugins/auth';
import { audit } from '../../lib/audit';
import { toCsv } from '../../lib/csv';
import { REPORT_LABELS, REPORT_TYPES, buildReport } from './service';

const reportQuery = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  classId: z.uuid().optional(),
  generationId: z.uuid().optional(),
  studentId: z.uuid().optional(),
  search: z.string().trim().max(100).optional(),
  includeInactiveAccounts: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  granularity: z.enum(['week', 'month']).optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

/**
 * Report endpoints, mounted at /api/v1/trainer/reports (assigned students) and
 * /api/v1/admin/reports (all students). Scope is decided by the caller's role.
 */
export function reportRoutes(...roles: ('TRAINER' | 'ADMIN')[]): FastifyPluginAsyncZod {
  return async (app) => {
    app.addHook('preHandler', requireAuth(...roles));

    app.get('/', { schema: { tags: ['reports'] } }, async () => ({
      data: REPORT_TYPES.map((type) => ({ type, label: REPORT_LABELS[type] })),
    }));

    app.get(
      '/:type',
      {
        schema: {
          tags: ['reports'],
          params: z.object({ type: z.enum(REPORT_TYPES) }),
          querystring: reportQuery,
        },
      },
      async (request, reply) => {
        const actor = authOf(request);
        const { format, ...query } = request.query;
        const report = await buildReport(app, actor, request.params.type, query);
        if (format === 'json') return { data: report };

        await audit(app.prisma, request, {
          action: 'report.exported',
          entityType: 'report',
          entityId: report.type,
          metadata: { ...query, from: report.from, to: report.to, rows: report.rows.length },
        });
        const filename = `${report.type}_${report.from}_${report.to}.csv`;
        return reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', `attachment; filename="${filename}"`)
          .header('cache-control', 'no-store')
          .send(toCsv(report.headers, report.rows));
      },
    );
  };
}

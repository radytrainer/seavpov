import type { FastifyInstance } from 'fastify';
import { buildSeries, sumInPeriod } from '@rt/shared';
import type { AuthContext } from '../../plugins/auth';
import { assertCanViewStudent } from '../../lib/access';
import { badRequest } from '../../lib/errors';
import { dailyTotalsFor } from '../analytics/service';
import {
  metricsFor,
  resolveRange,
  studentFilterWhere,
  type StudentFilters,
} from '../trainer/service';

export const REPORT_TYPES = [
  'student-summary',
  'daily-activity',
  'period-summary',
  'sessions',
  'inactive-students',
  'reflections',
  'book-completion',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABELS: Record<ReportType, string> = {
  'student-summary': 'Student summary (time, consistency, streak, goal)',
  'daily-activity': 'Daily reading activity',
  'period-summary': 'Weekly / monthly reading summary',
  sessions: 'Individual reading history (sessions)',
  'inactive-students': 'Inactive students',
  reflections: 'Reflection submissions (counts only)',
  'book-completion': 'Completed books',
};

export interface ReportQuery extends StudentFilters {
  from?: string;
  to?: string;
  studentId?: string;
  /** For period-summary: week (Monday start) or calendar month. */
  granularity?: 'week' | 'month';
}

export interface Report {
  type: ReportType;
  from: string;
  to: string;
  headers: string[];
  rows: (string | number | null)[][];
}

const minutes = (s: number) => Math.round(s / 60);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Builds a report scoped to the students the actor may oversee. Reflection text is never
 * exported; reports contain counts and dates only.
 */
export async function buildReport(
  app: FastifyInstance,
  actor: AuthContext,
  type: ReportType,
  q: ReportQuery,
): Promise<Report> {
  const range = await resolveRange(app, q.from, q.to);
  if (q.studentId) await assertCanViewStudent(app.prisma, actor, q.studentId);
  if (type === 'sessions' && !q.studentId) {
    throw badRequest('Choose a student for the reading history report');
  }

  const students = await app.prisma.user.findMany({
    where: {
      AND: [studentFilterWhere(actor, q), q.studentId ? { id: q.studentId } : {}],
    },
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      class: { select: { name: true, generation: { select: { name: true } } } },
    },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    take: 5000,
  });
  const ids = students.map((s) => s.id);
  const who = (s: (typeof students)[number]) => [
    s.studentCode,
    s.fullName,
    s.class?.name ?? null,
    s.class?.generation.name ?? null,
  ];
  const WHO = ['Student ID', 'Name', 'Class', 'Generation'];
  const fromDate = new Date(`${range.from}T00:00:00Z`);
  const toDate = new Date(`${range.to}T00:00:00Z`);
  const base = { type, from: range.from, to: range.to };

  switch (type) {
    case 'student-summary': {
      const m = await metricsFor(app, ids, range);
      const weeks = (Date.parse(range.to) - Date.parse(range.from)) / (7 * 86_400_000) + 1 / 7;
      return {
        ...base,
        headers: [
          ...WHO,
          'Minutes',
          'Sessions',
          'Reading days',
          'Consistency %',
          'Current streak',
          'Last reading date',
          'Books completed',
          'Reflections',
          'Weekly goal (min)',
          'Avg weekly minutes',
          'Goal attainment %',
        ],
        rows: students.map((s) => {
          const x = m.get(s.id)!;
          const avgWeekly = minutes(x.rangeSeconds / Math.max(weeks, 1 / 7));
          return [
            ...who(s),
            minutes(x.rangeSeconds),
            x.rangeSessions,
            x.rangeReadingDays,
            x.consistencyPercent,
            x.currentStreak,
            x.lastReadingDate,
            x.booksCompletedInRange,
            x.reflectionsInRange,
            x.weeklyGoalMinutes,
            avgWeekly,
            x.weeklyGoalMinutes
              ? Math.min(100, Math.round((avgWeekly / x.weeklyGoalMinutes) * 100))
              : null,
          ];
        }),
      };
    }

    case 'daily-activity': {
      const totals = await dailyTotalsFor(app.prisma, ids, range);
      const rows: Report['rows'] = [];
      for (const s of students) {
        for (const d of totals.get(s.id) ?? []) {
          rows.push([d.date, ...who(s), minutes(d.seconds), d.sessions, d.pages]);
        }
      }
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return { ...base, headers: ['Date', ...WHO, 'Minutes', 'Sessions', 'Pages'], rows };
    }

    case 'period-summary': {
      const granularity = q.granularity ?? 'week';
      const minSeconds = range.settings.minDailyMinutes * 60;
      const totals = await dailyTotalsFor(app.prisma, ids, range);
      const rows: Report['rows'] = [];
      for (const s of students) {
        for (const p of buildSeries(
          totals.get(s.id) ?? [],
          range.from,
          range.to,
          granularity,
          minSeconds,
        )) {
          rows.push([p.period, ...who(s), minutes(p.seconds), p.sessions, p.readingDays, p.pages]);
        }
      }
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      return {
        ...base,
        headers: [
          granularity === 'week' ? 'Week starting' : 'Month',
          ...WHO,
          'Minutes',
          'Sessions',
          'Reading days',
          'Pages',
        ],
        rows,
      };
    }

    case 'sessions': {
      const sessions = await app.prisma.readingSession.findMany({
        where: {
          studentId: q.studentId!,
          status: 'COMPLETED',
          readingDate: { gte: fromDate, lte: toDate },
        },
        select: {
          readingDate: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          durationCapped: true,
          source: true,
          startPage: true,
          endPage: true,
          reflection: { select: { id: true } },
          studentBook: { select: { libraryBook: { select: { title: true, author: true } } } },
        },
        orderBy: { startedAt: 'asc' },
      });
      const s = students[0];
      return {
        ...base,
        headers: [
          ...WHO,
          'Date',
          'Book',
          'Author',
          'Start (UTC)',
          'End (UTC)',
          'Minutes',
          'Type',
          'Start page',
          'End page',
          'Capped',
          'Reflection',
        ],
        rows: sessions.map((x) => [
          ...(s ? who(s) : [null, null, null, null]),
          day(x.readingDate),
          x.studentBook.libraryBook.title,
          x.studentBook.libraryBook.author,
          x.startedAt.toISOString(),
          x.endedAt?.toISOString() ?? null,
          minutes(x.durationSeconds),
          x.source === 'MANUAL' ? 'Manual' : 'Timer',
          x.startPage,
          x.endPage,
          x.durationCapped ? 'Yes' : 'No',
          x.reflection ? 'Yes' : 'No',
        ]),
      };
    }

    case 'inactive-students': {
      const m = await metricsFor(app, ids, range);
      return {
        ...base,
        headers: [
          ...WHO,
          'Last reading date',
          `Inactive (no reading in ${range.settings.inactiveAfterDays} days)`,
        ],
        rows: students
          .filter((s) => m.get(s.id)!.inactive)
          .map((s) => [...who(s), m.get(s.id)!.lastReadingDate, 'Yes']),
      };
    }

    case 'reflections': {
      const [rows, totals] = await Promise.all([
        app.prisma.readingReflection.findMany({
          where: {
            studentId: { in: ids },
            session: { readingDate: { gte: fromDate, lte: toDate } },
          },
          select: {
            studentId: true,
            understandingRating: true,
            _count: { select: { feedback: true } },
          },
        }),
        dailyTotalsFor(app.prisma, ids, range),
      ]);
      return {
        ...base,
        headers: [
          ...WHO,
          'Sessions',
          'Reflections',
          'Reflection rate %',
          'With feedback',
          'Average understanding (1–5)',
        ],
        rows: students.map((s) => {
          const mine = rows.filter((r) => r.studentId === s.id);
          const sessions = sumInPeriod(totals.get(s.id) ?? [], range).sessions;
          const rated = mine.filter((r) => r.understandingRating != null);
          return [
            ...who(s),
            sessions,
            mine.length,
            sessions ? Math.round((mine.length / sessions) * 100) : 0,
            mine.filter((r) => r._count.feedback > 0).length,
            rated.length
              ? Math.round(
                  (rated.reduce((a, r) => a + r.understandingRating!, 0) / rated.length) * 10,
                ) / 10
              : null,
          ];
        }),
      };
    }

    case 'book-completion': {
      const books = await app.prisma.studentBook.findMany({
        where: {
          studentId: { in: ids },
          status: 'COMPLETED',
          completedAt: { gte: fromDate, lt: new Date(toDate.getTime() + 86_400_000) },
        },
        select: {
          studentId: true,
          startedAt: true,
          completedAt: true,
          libraryBook: {
            select: { title: true, author: true, category: { select: { name: true } } },
          },
        },
        orderBy: { completedAt: 'asc' },
      });
      const byId = new Map(students.map((s) => [s.id, s]));
      return {
        ...base,
        headers: [...WHO, 'Book', 'Author', 'Category', 'Started', 'Completed'],
        rows: books.map((b) => [
          ...who(byId.get(b.studentId)!),
          b.libraryBook.title,
          b.libraryBook.author,
          b.libraryBook.category?.name ?? null,
          day(b.startedAt),
          day(b.completedAt),
        ]),
      };
    }
  }
}

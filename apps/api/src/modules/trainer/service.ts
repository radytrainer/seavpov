import type { FastifyInstance } from 'fastify';
import {
  addDays,
  buildSeries,
  diffDays,
  percentOf,
  progressPercent,
  toLocalDate,
} from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { assertCanViewStudent } from '../../lib/access';
import { badRequest } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';
import { getSettings } from '../../lib/settings';
import { aggregateDailyTotals, habitStatsFor, studentSummary } from '../analytics/service';
import { effectiveGoalsFor } from '../goals/service';
import { userSearchFilter } from '../users/service';
import { userSelect } from '../users/dto';

/** Students the actor may oversee: assigned students for trainers, all students for admins. */
export function overseenStudents(actor: AuthContext): Prisma.UserWhereInput {
  return actor.role === 'ADMIN'
    ? { role: 'STUDENT' }
    : { role: 'STUDENT', studentAssignments: { some: { trainerId: actor.userId } } };
}

export interface StudentFilters {
  search?: string;
  classId?: string;
  generationId?: string;
  includeInactiveAccounts?: boolean;
  /** Account status filter for lists (default ACTIVE). */
  accountStatus?: 'ACTIVE' | 'INACTIVE' | 'ALL';
}

export function studentFilterWhere(actor: AuthContext, f: StudentFilters): Prisma.UserWhereInput {
  return {
    AND: [
      overseenStudents(actor),
      f.includeInactiveAccounts || f.accountStatus === 'ALL'
        ? {}
        : { status: f.accountStatus === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE' },
      f.classId ? { classId: f.classId } : {},
      f.generationId ? { class: { generationId: f.generationId } } : {},
      userSearchFilter(f.search),
    ],
  };
}

export async function resolveRange(app: FastifyInstance, from?: string, to?: string) {
  const settings = await getSettings(app.prisma);
  const today = toLocalDate(app.now(), settings.timeZone);
  const end = to ?? today;
  const start = from ?? addDays(end, -6);
  if (start > end) throw badRequest('Start date must be before end date');
  if (Date.parse(end) - Date.parse(start) > 366 * 86_400_000) {
    throw badRequest('Choose a range of at most one year');
  }
  return { settings, today, from: start, to: end };
}

export interface StudentMetrics {
  rangeSeconds: number;
  rangeSessions: number;
  rangeReadingDays: number;
  consistencyPercent: number;
  currentStreak: number;
  lastReadingDate: string | null;
  inactive: boolean;
  reflectionsInRange: number;
  awaitingFeedback: number;
  booksReading: number;
  booksCompletedInRange: number;
  weeklyGoalMinutes: number;
  /** Reading time in the range relative to the weekly goal scaled to the range length (0–100). */
  goalPercent: number | null;
  /** Most recently read book that is in progress. */
  currentBook: { studentBookId: string; title: string; progressPercent: number | null } | null;
}

/**
 * Batched metrics for a set of students: a constant number of queries, each returning at most
 * one row per student (habit statistics are aggregated in SQL, see habitStatsFor).
 */
export async function metricsFor(
  app: FastifyInstance,
  studentIds: string[],
  range: Awaited<ReturnType<typeof resolveRange>>,
): Promise<Map<string, StudentMetrics>> {
  const { settings, today, from, to } = range;
  const minSeconds = settings.minDailyMinutes * 60;
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const [totals, reflections, awaiting, reading, completed, goals] = await Promise.all([
    habitStatsFor(app.prisma, studentIds, { from, to, today, minSeconds }),
    app.prisma.readingReflection.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        session: { readingDate: { gte: fromDate, lte: toDate } },
      },
      _count: { _all: true },
    }),
    app.prisma.readingReflection.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, feedback: { none: {} } },
      _count: { _all: true },
    }),
    app.prisma.studentBook.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        status: { in: ['READING', 'PAUSED'] },
        archivedAt: null,
      },
      _count: { _all: true },
    }),
    app.prisma.studentBook.groupBy({
      by: ['studentId'],
      where: {
        studentId: { in: studentIds },
        status: 'COMPLETED',
        completedAt: { gte: fromDate, lt: new Date(toDate.getTime() + 86_400_000) },
      },
      _count: { _all: true },
    }),
    effectiveGoalsFor(app.prisma, studentIds, settings, today),
  ]);
  // Current books: in-progress records, most recently read first (first one per student wins).
  const inProgress = await app.prisma.studentBook.findMany({
    where: {
      studentId: { in: studentIds },
      status: { in: ['READING', 'PAUSED'] },
      archivedAt: null,
    },
    orderBy: [{ lastReadAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    select: {
      id: true,
      studentId: true,
      currentPage: true,
      totalPages: true,
      libraryBook: { select: { title: true, totalPages: true } },
    },
  });
  const currentBooks = new Map<string, StudentMetrics['currentBook']>();
  for (const b of inProgress) {
    if (currentBooks.has(b.studentId)) continue;
    currentBooks.set(b.studentId, {
      studentBookId: b.id,
      title: b.libraryBook.title,
      progressPercent: progressPercent(b.currentPage, b.totalPages ?? b.libraryBook.totalPages),
    });
  }
  const index = (rows: { studentId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.studentId, r._count._all]));
  const [reflectionCounts, awaitingCounts, readingCounts, completedCounts] = [
    reflections,
    awaiting,
    reading,
    completed,
  ].map(index) as [
    Map<string, number>,
    Map<string, number>,
    Map<string, number>,
    Map<string, number>,
  ];
  // Consistency covers the elapsed part of the range only.
  const effectiveTo = to < today ? to : today;
  const rangeDays = effectiveTo < from ? 0 : diffDays(from, effectiveTo) + 1;

  const result = new Map<string, StudentMetrics>();
  studentIds.forEach((id) => {
    const h = totals.get(id)!;
    const lastReadingDate = h.lastReadingDate;
    result.set(id, {
      rangeSeconds: h.rangeSeconds,
      rangeSessions: h.rangeSessions,
      rangeReadingDays: h.rangeReadingDays,
      consistencyPercent: rangeDays ? Math.round((h.rangeReadingDays / rangeDays) * 100) : 0,
      currentStreak: h.currentStreak,
      lastReadingDate,
      inactive:
        !lastReadingDate || lastReadingDate < addDays(today, -settings.inactiveAfterDays + 1),
      reflectionsInRange: reflectionCounts.get(id) ?? 0,
      awaitingFeedback: awaitingCounts.get(id) ?? 0,
      booksReading: readingCounts.get(id) ?? 0,
      booksCompletedInRange: completedCounts.get(id) ?? 0,
      weeklyGoalMinutes: goals.get(id)!.weeklyMinutes,
      goalPercent: rangeDays
        ? percentOf(h.rangeSeconds, (goals.get(id)!.weeklyMinutes * 60 * rangeDays) / 7)
        : null,
      currentBook: currentBooks.get(id) ?? null,
    });
  });
  return result;
}

export async function listStudents(
  app: FastifyInstance,
  actor: AuthContext,
  q: StudentFilters & {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
    inactiveOnly?: boolean;
    /** Students without any trainer (administrators). */
    unassigned?: boolean;
  },
) {
  const range = await resolveRange(app, q.from, q.to);
  const where: Prisma.UserWhereInput = { AND: [studentFilterWhere(actor, q)] };
  if (q.inactiveOnly) {
    const since = new Date(
      `${addDays(range.today, -range.settings.inactiveAfterDays + 1)}T00:00:00Z`,
    );
    (where.AND as Prisma.UserWhereInput[]).push({
      readingSessions: { none: { status: 'COMPLETED', readingDate: { gte: since } } },
    });
  }
  if (q.unassigned) {
    (where.AND as Prisma.UserWhereInput[]).push({ studentAssignments: { none: {} } });
  }
  const [students, total] = await app.prisma.$transaction([
    app.prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      ...pageArgs(q),
    }),
    app.prisma.user.count({ where }),
  ]);
  const ids = students.map((s) => s.id);
  const [metrics, assignments] = await Promise.all([
    metricsFor(app, ids, range),
    app.prisma.trainerStudentAssignment.findMany({
      where: { studentId: { in: ids } },
      select: { studentId: true, trainer: { select: { id: true, fullName: true } } },
      orderBy: { trainer: { fullName: 'asc' } },
    }),
  ]);
  return {
    items: students.map((s) => ({
      student: s,
      metrics: metrics.get(s.id)!,
      trainers: assignments.filter((a) => a.studentId === s.id).map((a) => a.trainer),
    })),
    total,
    range: { from: range.from, to: range.to, inactiveAfterDays: range.settings.inactiveAfterDays },
  };
}

export async function studentDetail(app: FastifyInstance, actor: AuthContext, studentId: string) {
  await assertCanViewStudent(app.prisma, actor, studentId);
  const student = await app.prisma.user.findFirst({
    where: { id: studentId, role: 'STUDENT' },
    select: userSelect,
  });
  if (!student) throw badRequest('Not a student');
  return { student, summary: await studentSummary(app, studentId) };
}

/** Overview for the trainer home page plus class-level trend (aggregate, no per-student data). */
export async function overview(
  app: FastifyInstance,
  actor: AuthContext,
  q: { classId?: string; generationId?: string; from?: string; to?: string },
) {
  const range = await resolveRange(app, q.from, q.to);
  const students = await app.prisma.user.findMany({
    where: studentFilterWhere(actor, q),
    select: { id: true },
  });
  const ids = students.map((s) => s.id);
  const [metrics, totals, pendingFeedback] = await Promise.all([
    metricsFor(app, ids, range),
    aggregateDailyTotals(app.prisma, ids, { from: range.from, to: range.to }),
    app.prisma.readingReflection.count({
      where: { studentId: { in: ids }, feedback: { none: {} } },
    }),
  ]);
  const values = [...metrics.values()];
  const granularity =
    Date.parse(range.to) - Date.parse(range.from) > 62 * 86_400_000
      ? ('week' as const)
      : ('day' as const);
  const activeStudents = values.filter((m) => m.rangeSessions > 0).length;
  const totalSeconds = values.reduce((a, m) => a + m.rangeSeconds, 0);
  return {
    range: { from: range.from, to: range.to, inactiveAfterDays: range.settings.inactiveAfterDays },
    students: ids.length,
    activeStudents,
    inactiveStudents: values.filter((m) => m.inactive).length,
    pendingFeedback,
    totalSeconds,
    granularity,
    averageSecondsPerStudent: ids.length ? Math.round(totalSeconds / ids.length) : 0,
    averageConsistencyPercent: values.length
      ? Math.round(values.reduce((a, m) => a + m.consistencyPercent, 0) / values.length)
      : 0,
    series: buildSeries(
      totals,
      range.from,
      range.to,
      granularity,
      // Aggregate series: readingDays is not meaningful across students.
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

export async function filterOptions(app: FastifyInstance, actor: AuthContext) {
  const classes = await app.prisma.class.findMany({
    where: actor.role === 'ADMIN' ? {} : { students: { some: overseenStudents(actor) } },
    select: { id: true, name: true, generation: { select: { id: true, name: true } } },
    orderBy: [{ generation: { name: 'asc' } }, { name: 'asc' }],
  });
  const generations = [...new Map(classes.map((c) => [c.generation.id, c.generation])).values()];
  return { classes, generations };
}

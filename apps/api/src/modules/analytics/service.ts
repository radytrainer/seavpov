import type { FastifyInstance } from 'fastify';
import {
  addDays,
  buildSeries,
  changePercent,
  consistencyPercent,
  localDateTimeToUtc,
  percentOf,
  periodBounds,
  qualifyingDays,
  streaks,
  sumInPeriod,
  toLocalDate,
  type DayTotal,
  type Granularity,
} from '@rt/shared';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { getSettings } from '../../lib/settings';
import { effectiveGoal } from '../goals/service';

/**
 * Per-day totals of COMPLETED sessions (cancelled and running sessions never count).
 * Pages are counted only for sessions with both a start and end page.
 */
export async function dailyTotalsFor(
  prisma: PrismaClient,
  studentIds: string[],
  range?: { from: string; to: string },
): Promise<Map<string, DayTotal[]>> {
  const result = new Map<string, DayTotal[]>(studentIds.map((id) => [id, []]));
  if (studentIds.length === 0) return result;
  const rangeSql = range
    ? Prisma.sql`AND reading_date BETWEEN ${range.from}::date AND ${range.to}::date`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { student_id: string; date: string; seconds: number; sessions: number; pages: number }[]
  >`
    SELECT student_id::text AS student_id,
           to_char(reading_date, 'YYYY-MM-DD') AS date,
           SUM(duration_seconds)::int AS seconds,
           COUNT(*)::int AS sessions,
           COALESCE(SUM(end_page - start_page) FILTER (
             WHERE start_page IS NOT NULL AND end_page IS NOT NULL), 0)::int AS pages
    FROM reading_sessions
    WHERE student_id = ANY(${studentIds}::uuid[])
      AND status = 'COMPLETED'
      ${rangeSql}
    GROUP BY student_id, reading_date
    ORDER BY reading_date`;
  for (const r of rows) {
    result.get(r.student_id)!.push({
      date: r.date,
      seconds: r.seconds,
      sessions: r.sessions,
      pages: r.pages,
    });
  }
  return result;
}

/** UTC instants for local calendar bounds [from 00:00, to+1 00:00). */
function instantRange(from: string, to: string, timeZone: string) {
  return {
    gte: localDateTimeToUtc(from, '00:00', timeZone),
    lt: localDateTimeToUtc(addDays(to, 1), '00:00', timeZone),
  };
}

export async function studentSummary(app: FastifyInstance, studentId: string) {
  const settings = await getSettings(app.prisma);
  const today = toLocalDate(app.now(), settings.timeZone);
  const p = periodBounds(today);
  const minSeconds = settings.minDailyMinutes * 60;
  const monthInstants = instantRange(p.month.from, p.month.to, settings.timeZone);

  const [totalsMap, bookGroups, startedBooks, completedThisMonth, reflectionCount, goal] =
    await Promise.all([
      dailyTotalsFor(app.prisma, [studentId]),
      app.prisma.studentBook.groupBy({
        by: ['status'],
        where: { studentId, archivedAt: null },
        _count: { _all: true },
      }),
      app.prisma.studentBook.count({ where: { studentId, startedAt: { not: null } } }),
      app.prisma.studentBook.count({
        where: { studentId, status: 'COMPLETED', completedAt: monthInstants },
      }),
      app.prisma.readingReflection.count({ where: { studentId } }),
      effectiveGoal(app.prisma, studentId, settings, today),
    ]);

  const days = totalsMap.get(studentId) ?? [];
  const readingDays = qualifyingDays(days, minSeconds);
  const streak = streaks(readingDays, today);
  const all = days.reduce(
    (acc, d) => ({
      seconds: acc.seconds + d.seconds,
      sessions: acc.sessions + d.sessions,
      pages: acc.pages + d.pages,
    }),
    { seconds: 0, sessions: 0, pages: 0 },
  );
  const todayTotals = sumInPeriod(days, p.today);
  const week = sumInPeriod(days, p.week);
  const lastWeek = sumInPeriod(days, p.lastWeek);
  const month = sumInPeriod(days, p.month);
  const lastMonth = sumInPeriod(days, p.lastMonth);
  const weekReadingDays = readingDays.filter((d) => d >= p.week.from && d <= p.week.to).length;
  const count = (s: string) => bookGroups.find((g) => g.status === s)?._count._all ?? 0;
  // Elapsed part of the current month, so consistency is not diluted by future days.
  const monthConsistency = consistencyPercent(readingDays, p.month.from, today);

  return {
    today,
    timeZone: settings.timeZone,
    minDailyMinutes: settings.minDailyMinutes,
    time: {
      todaySeconds: todayTotals.seconds,
      weekSeconds: week.seconds,
      monthSeconds: month.seconds,
      lastWeekSeconds: lastWeek.seconds,
      lastMonthSeconds: lastMonth.seconds,
      weekChangePercent: changePercent(week.seconds, lastWeek.seconds),
      monthChangePercent: changePercent(month.seconds, lastMonth.seconds),
      totalSeconds: all.seconds,
    },
    sessions: {
      total: all.sessions,
      averageSeconds: all.sessions > 0 ? Math.round(all.seconds / all.sessions) : 0,
      thisWeek: week.sessions,
    },
    pages: { total: all.pages, thisWeek: week.pages, thisMonth: month.pages },
    books: {
      reading: count('READING') + count('PAUSED'),
      planned: count('PLANNED'),
      completed: count('COMPLETED'),
      started: startedBooks,
      completedThisMonth,
    },
    streak: { current: streak.current, longest: streak.longest },
    consistency: {
      weekReadingDays,
      monthPercent: monthConsistency,
      lastReadingDate: days.at(-1)?.date ?? null,
    },
    reflections: {
      total: reflectionCount,
      completionPercent: all.sessions > 0 ? Math.round((reflectionCount / all.sessions) * 100) : 0,
    },
    goal: {
      ...goal,
      progress: {
        dailyPercent: percentOf(todayTotals.seconds, goal.dailyMinutes * 60),
        weeklyPercent: percentOf(week.seconds, goal.weeklyMinutes * 60),
        daysPercent: percentOf(weekReadingDays, goal.daysPerWeek),
        monthlyBooksPercent: percentOf(completedThisMonth, goal.monthlyBooks),
      },
    },
    last7Days: buildSeries(days, addDays(today, -6), today, 'day', minSeconds),
  };
}

export type StudentSummary = Awaited<ReturnType<typeof studentSummary>>;

export async function readingTrends(
  app: FastifyInstance,
  studentId: string,
  query: { from?: string; to?: string; granularity: Granularity },
) {
  const settings = await getSettings(app.prisma);
  const today = toLocalDate(app.now(), settings.timeZone);
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -29);
  const minSeconds = settings.minDailyMinutes * 60;
  const days = (await dailyTotalsFor(app.prisma, [studentId], { from, to })).get(studentId) ?? [];
  const readingDays = qualifyingDays(days, minSeconds);
  const total = sumInPeriod(days, { from, to });
  const effectiveTo = to > today ? today : to;
  const weeks = Math.max(1, (Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1) / 7);
  return {
    from,
    to,
    granularity: query.granularity,
    series: buildSeries(days, from, to, query.granularity, minSeconds),
    totals: {
      seconds: total.seconds,
      sessions: total.sessions,
      pages: total.pages,
      readingDays: readingDays.length,
      averageSessionSeconds: total.sessions ? Math.round(total.seconds / total.sessions) : 0,
      sessionsPerWeek: Math.round((total.sessions / weeks) * 10) / 10,
      consistencyPercent: consistencyPercent(readingDays, from, effectiveTo),
    },
  };
}

export interface HabitStats {
  rangeSeconds: number;
  rangeSessions: number;
  rangeReadingDays: number;
  currentStreak: number;
  longestStreak: number;
  lastReadingDate: string | null;
}

/**
 * Per-student habit statistics computed entirely in SQL (one row per student), for views that
 * cover many students. Uses the same rules as packages/shared/src/metrics.ts: a reading day has
 * ≥ minSeconds of COMPLETED reading; the current streak ends today or yesterday.
 * Streaks are found with the "gaps and islands" technique (date − row_number is constant
 * within a run of consecutive days).
 */
export async function habitStatsFor(
  prisma: PrismaClient,
  studentIds: string[],
  opts: { from: string; to: string; today: string; minSeconds: number },
): Promise<Map<string, HabitStats>> {
  const result = new Map<string, HabitStats>();
  for (const id of studentIds) {
    result.set(id, {
      rangeSeconds: 0,
      rangeSessions: 0,
      rangeReadingDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastReadingDate: null,
    });
  }
  if (studentIds.length === 0) return result;
  const rows = await prisma.$queryRaw<
    {
      student_id: string;
      range_seconds: number;
      range_sessions: number;
      range_days: number;
      current_streak: number;
      longest_streak: number;
      last_date: string | null;
    }[]
  >`
    WITH days AS (
      SELECT student_id, reading_date, SUM(duration_seconds) AS secs, COUNT(*) AS n
      FROM reading_sessions
      WHERE student_id = ANY(${studentIds}::uuid[])
        AND status = 'COMPLETED'
        AND reading_date <= ${opts.today}::date
      GROUP BY student_id, reading_date
    ),
    qualifying AS (
      SELECT student_id, reading_date,
             reading_date - (ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY reading_date))::int AS grp
      FROM days
      WHERE secs >= ${opts.minSeconds}
    ),
    runs AS (
      SELECT student_id, MAX(reading_date) AS run_end, COUNT(*) AS len
      FROM qualifying
      GROUP BY student_id, grp
    ),
    streaks AS (
      SELECT student_id,
             MAX(len) AS longest,
             COALESCE(MAX(len) FILTER (WHERE run_end >= ${opts.today}::date - 1), 0) AS current
      FROM runs
      GROUP BY student_id
    ),
    totals AS (
      SELECT student_id,
             COALESCE(SUM(secs) FILTER (WHERE reading_date BETWEEN ${opts.from}::date AND ${opts.to}::date), 0) AS range_seconds,
             COALESCE(SUM(n) FILTER (WHERE reading_date BETWEEN ${opts.from}::date AND ${opts.to}::date), 0) AS range_sessions,
             COUNT(*) FILTER (WHERE secs >= ${opts.minSeconds}
                              AND reading_date BETWEEN ${opts.from}::date AND ${opts.to}::date) AS range_days,
             MAX(reading_date) AS last_date
      FROM days
      GROUP BY student_id
    )
    SELECT t.student_id::text AS student_id,
           t.range_seconds::int AS range_seconds,
           t.range_sessions::int AS range_sessions,
           t.range_days::int AS range_days,
           COALESCE(s.current, 0)::int AS current_streak,
           COALESCE(s.longest, 0)::int AS longest_streak,
           to_char(t.last_date, 'YYYY-MM-DD') AS last_date
    FROM totals t LEFT JOIN streaks s USING (student_id)`;
  for (const r of rows) {
    result.set(r.student_id, {
      rangeSeconds: r.range_seconds,
      rangeSessions: r.range_sessions,
      rangeReadingDays: r.range_days,
      currentStreak: r.current_streak,
      longestStreak: r.longest_streak,
      lastReadingDate: r.last_date,
    });
  }
  return result;
}

/** Daily totals summed across many students (one row per day), for aggregate charts. */
export async function aggregateDailyTotals(
  prisma: PrismaClient,
  studentIds: string[],
  range: { from: string; to: string },
): Promise<DayTotal[]> {
  if (studentIds.length === 0) return [];
  return prisma.$queryRaw<DayTotal[]>`
    SELECT to_char(reading_date, 'YYYY-MM-DD') AS date,
           SUM(duration_seconds)::int AS seconds,
           COUNT(*)::int AS sessions,
           COALESCE(SUM(end_page - start_page) FILTER (
             WHERE start_page IS NOT NULL AND end_page IS NOT NULL), 0)::int AS pages
    FROM reading_sessions
    WHERE student_id = ANY(${studentIds}::uuid[])
      AND status = 'COMPLETED'
      AND reading_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY reading_date
    ORDER BY reading_date`;
}

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

// Wednesday 4 March 2026, 10:00 in Asia/Phnom_Penh.
const NOW = new Date('2026-03-04T03:00:00Z');

async function session(
  prisma: PrismaClient,
  studentId: string,
  studentBookId: string,
  date: string,
  minutes: number,
  extra: { startPage?: number; endPage?: number; status?: 'COMPLETED' | 'CANCELLED' } = {},
) {
  const startedAt = new Date(`${date}T02:00:00Z`);
  await prisma.readingSession.create({
    data: {
      studentId,
      studentBookId,
      status: extra.status ?? 'COMPLETED',
      startedAt,
      endedAt: new Date(startedAt.getTime() + minutes * 60_000),
      durationSeconds: minutes * 60,
      readingDate: new Date(`${date}T00:00:00Z`),
      startPage: extra.startPage ?? null,
      endPage: extra.endPage ?? null,
    },
  });
}

describe('analytics and goals', () => {
  let ctx: TestContext;
  let alice: Client;
  let empty: Client;
  let aliceId: string;
  let bookId: string;

  beforeAll(async () => {
    ctx = await createTestApp({ clock: () => NOW });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'STUDENT');
    const e = await createUser(ctx.prisma, 'STUDENT');
    aliceId = a.id;
    alice = await loginAs(ctx.app, a.username);
    empty = await loginAs(ctx.app, e.username);
    const lib = await ctx.prisma.libraryBook.create({
      data: { title: 'Cosmos', normalizedKey: 'cosmos|', totalPages: 300 },
    });
    const lib2 = await ctx.prisma.libraryBook.create({
      data: { title: 'Sapiens', normalizedKey: 'sapiens|' },
    });
    bookId = (
      await ctx.prisma.studentBook.create({
        data: { studentId: a.id, libraryBookId: lib.id, status: 'READING', startedAt: NOW },
      })
    ).id;
    await ctx.prisma.studentBook.create({
      data: {
        studentId: a.id,
        libraryBookId: lib2.id,
        status: 'COMPLETED',
        startedAt: new Date('2026-02-01T00:00:00Z'),
        completedAt: new Date('2026-03-02T05:00:00Z'),
      },
    });

    const s = (date: string, min: number, extra = {}) =>
      session(ctx.prisma, a.id, bookId, date, min, extra);
    await s('2026-02-27', 30, { startPage: 10, endPage: 20 }); // last month
    await s('2026-02-28', 15);
    await s('2026-03-01', 5); // two sessions on Sunday = 11 min → qualifies
    await s('2026-03-01', 6);
    await s('2026-03-02', 20, { startPage: 20, endPage: 35 });
    await s('2026-03-03', 8); // below the 10-minute minimum
    await s('2026-03-03', 120, { status: 'CANCELLED' }); // never counted
    await s('2026-03-04', 12);
    // A running session today is not counted until it is finished.
    await ctx.prisma.readingSession.create({
      data: {
        studentId: a.id,
        studentBookId: bookId,
        status: 'READING',
        startedAt: NOW,
        lastResumedAt: NOW,
        readingDate: new Date('2026-03-04T00:00:00Z'),
      },
    });
    await ctx.prisma.readingReflection.create({
      data: {
        sessionId: (
          await ctx.prisma.readingSession.findFirstOrThrow({ where: { status: 'COMPLETED' } })
        ).id,
        studentId: a.id,
        learned: 'x',
      },
    });
  });

  it('computes the dashboard summary from completed sessions only', async () => {
    const res = await alice.get('/api/v1/analytics/me');
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.today).toBe('2026-03-04');
    expect(d.time).toMatchObject({
      todaySeconds: 12 * 60,
      weekSeconds: 40 * 60, // Mon 2 – Sun 8 March: 20 + 8 + 12
      lastWeekSeconds: 56 * 60, // 23 Feb – 1 Mar: 30 + 15 + 11
      monthSeconds: 51 * 60, // 11 + 20 + 8 + 12
      lastMonthSeconds: 45 * 60,
      weekChangePercent: -29,
      totalSeconds: 96 * 60,
    });
    expect(d.sessions).toMatchObject({ total: 7, averageSeconds: 823, thisWeek: 3 });
    expect(d.pages).toMatchObject({ total: 25, thisWeek: 15 });
    expect(d.books).toMatchObject({ reading: 1, completed: 1, started: 2, completedThisMonth: 1 });
    expect(d.streak).toEqual({ current: 1, longest: 4 });
    expect(d.consistency).toMatchObject({
      weekReadingDays: 2,
      monthPercent: 75, // 3 of 4 elapsed days
      lastReadingDate: '2026-03-04',
    });
    expect(d.reflections).toEqual({ total: 1, completionPercent: 14 });
    expect(d.goal).toMatchObject({
      isDefault: true,
      dailyMinutes: 20,
      progress: { dailyPercent: 60, weeklyPercent: 33, daysPercent: 40, monthlyBooksPercent: 100 },
    });
    expect(d.last7Days).toHaveLength(7);
    expect(d.last7Days.at(-1)).toMatchObject({ period: '2026-03-04', seconds: 720 });
  });

  it('respects the configured minimum reading-day duration', async () => {
    await ctx.prisma.systemSettings.update({ where: { id: 1 }, data: { minDailyMinutes: 5 } });
    const { invalidateSettings } = await import('../src/lib/settings');
    invalidateSettings();
    const d = (await alice.get('/api/v1/analytics/me')).json().data;
    // 3 March (8 min) now qualifies → 27 Feb … 4 Mar is one 6-day run.
    expect(d.streak).toEqual({ current: 6, longest: 6 });
  });

  it('handles students without any activity', async () => {
    const res = await empty.get('/api/v1/analytics/me');
    expect(res.statusCode).toBe(200);
    const d = res.json().data;
    expect(d.time.totalSeconds).toBe(0);
    expect(d.sessions).toMatchObject({ total: 0, averageSeconds: 0 });
    expect(d.streak).toEqual({ current: 0, longest: 0 });
    expect(d.reflections.completionPercent).toBe(0);
    expect(d.consistency.lastReadingDate).toBeNull();
    expect(d.time.weekChangePercent).toBe(0);
  });

  it('builds daily and monthly trends across the month boundary', async () => {
    const daily = (
      await alice.get('/api/v1/analytics/reading-trends?from=2026-02-27&to=2026-03-04')
    ).json().data;
    expect(daily.series.map((p: { seconds: number }) => p.seconds / 60)).toEqual([
      30, 15, 11, 20, 8, 12,
    ]);
    expect(daily.totals).toMatchObject({
      readingDays: 5,
      sessions: 7,
      consistencyPercent: 83,
    });
    const monthly = (
      await alice.get(
        '/api/v1/analytics/reading-trends?from=2026-02-01&to=2026-03-31&granularity=month',
      )
    ).json().data;
    expect(monthly.series).toEqual([
      expect.objectContaining({ period: '2026-02-01', seconds: 45 * 60, readingDays: 2 }),
      expect.objectContaining({ period: '2026-03-01', seconds: 51 * 60, readingDays: 3 }),
    ]);
    const bad = await alice.get('/api/v1/analytics/reading-trends?from=2026-03-05&to=2026-03-01');
    expect(bad.statusCode).toBe(400);
  });

  it('restricts trends of other students', async () => {
    expect(
      (await empty.get(`/api/v1/analytics/reading-trends?studentId=${aliceId}`)).statusCode,
    ).toBe(404);
    const trainer = await createUser(ctx.prisma, 'TRAINER');
    const t = await loginAs(ctx.app, trainer.username);
    expect((await t.get(`/api/v1/analytics/reading-trends?studentId=${aliceId}`)).statusCode).toBe(
      404,
    );
    await ctx.prisma.trainerStudentAssignment.create({
      data: { trainerId: trainer.id, studentId: aliceId },
    });
    expect((await t.get(`/api/v1/analytics/reading-trends?studentId=${aliceId}`)).statusCode).toBe(
      200,
    );
  });

  describe('goals', () => {
    it('sets a personal goal effective today and keeps history', async () => {
      const res = await alice.post('/api/v1/reading-goals', {
        dailyMinutes: 15,
        weeklyMinutes: 90,
        daysPerWeek: 4,
        monthlyBooks: 2,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({ effectiveFrom: '2026-03-04', isDefault: false });
      // Same day → updates the same row.
      await alice.post('/api/v1/reading-goals', {
        dailyMinutes: 12,
        weeklyMinutes: 90,
        daysPerWeek: 4,
      });
      const goals = (await alice.get('/api/v1/reading-goals')).json().data;
      expect(goals.history).toHaveLength(1);
      expect(goals.current).toMatchObject({ dailyMinutes: 12, monthlyBooks: null });
      const summary = (await alice.get('/api/v1/analytics/me')).json().data;
      expect(summary.goal.progress.dailyPercent).toBe(100); // 12 of 12 minutes
      expect(summary.goal.progress.monthlyBooksPercent).toBeNull();
    });

    it('rejects excessive or invalid goals', async () => {
      for (const body of [
        { dailyMinutes: 600, weeklyMinutes: 90, daysPerWeek: 4 },
        { dailyMinutes: 15, weeklyMinutes: 90, daysPerWeek: 8 },
        { dailyMinutes: 0, weeklyMinutes: 90, daysPerWeek: 4 },
      ]) {
        expect((await alice.post('/api/v1/reading-goals', body)).statusCode).toBe(400);
      }
    });

    it("cannot edit another student's goal", async () => {
      const goal = (
        await alice.post('/api/v1/reading-goals', {
          dailyMinutes: 15,
          weeklyMinutes: 90,
          daysPerWeek: 4,
        })
      ).json().data;
      const res = await empty.patch(`/api/v1/reading-goals/${goal.id}`, {
        dailyMinutes: 5,
        weeklyMinutes: 10,
        daysPerWeek: 1,
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

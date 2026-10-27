import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, qualifyingDays, streaks, sumInPeriod } from '@rt/shared';
import { dailyTotalsFor, habitStatsFor } from '../src/modules/analytics/service';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser } from './fixtures';

/**
 * The SQL implementation (used for many students at once) must agree with the unit-tested
 * TypeScript rules in packages/shared/src/metrics.ts. Randomised data, several students.
 */
describe('habitStatsFor matches the shared metric rules', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('agrees on range totals, reading days, streaks and last reading date', async () => {
    const today = '2026-03-10';
    const lib = await ctx.prisma.libraryBook.create({ data: { title: 'X', normalizedKey: 'x|' } });
    const ids: string[] = [];
    for (let s = 0; s < 8; s++) {
      const student = await createUser(ctx.prisma, 'STUDENT');
      ids.push(student.id);
      const sb = await ctx.prisma.studentBook.create({
        data: { studentId: student.id, libraryBookId: lib.id },
      });
      const data = [];
      for (let d = 0; d < 70; d++) {
        const date = addDays(today, -d + 2); // includes 2 future days, which must be ignored
        const sessions = Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
        for (let k = 0; k < sessions; k++) {
          const minutes = Math.floor(Math.random() * 15);
          data.push({
            studentId: student.id,
            studentBookId: sb.id,
            status: Math.random() < 0.1 ? ('CANCELLED' as const) : ('COMPLETED' as const),
            startedAt: new Date(`${date}T0${k}:00:00Z`),
            endedAt: new Date(`${date}T0${k}:30:00Z`),
            durationSeconds: minutes * 60,
            readingDate: new Date(`${date}T00:00:00Z`),
          });
        }
      }
      await ctx.prisma.readingSession.createMany({ data });
    }
    ids.push((await createUser(ctx.prisma, 'STUDENT')).id); // no activity at all

    const from = addDays(today, -13);
    const minSeconds = 600;
    const sql = await habitStatsFor(ctx.prisma, ids, { from, to: today, today, minSeconds });
    const all = await dailyTotalsFor(ctx.prisma, ids);
    for (const id of ids) {
      const days = (all.get(id) ?? []).filter((d) => d.date <= today);
      const reading = qualifyingDays(days, minSeconds);
      const inRange = sumInPeriod(days, { from, to: today });
      const s = streaks(reading, today);
      expect(sql.get(id)).toEqual({
        rangeSeconds: inRange.seconds,
        rangeSessions: inRange.sessions,
        rangeReadingDays: reading.filter((d) => d >= from).length,
        currentStreak: s.current,
        longestStreak: s.longest,
        lastReadingDate: days.at(-1)?.date ?? null,
      });
    }
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { csvCell, toCsv } from '../src/lib/csv';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createClass, createUser, loginAs, type Client } from './fixtures';

const NOW = new Date('2026-03-04T03:00:00Z'); // Wed 4 March, Phnom Penh

async function addSession(prisma: PrismaClient, studentId: string, date: string, minutes: number) {
  const lib = await prisma.libraryBook.create({
    data: { title: `Book ${Math.random()}`, normalizedKey: String(Math.random()) },
  });
  const sb = await prisma.studentBook.create({ data: { studentId, libraryBookId: lib.id } });
  return prisma.readingSession.create({
    data: {
      studentId,
      studentBookId: sb.id,
      status: 'COMPLETED',
      startedAt: new Date(`${date}T02:00:00Z`),
      endedAt: new Date(`${date}T03:00:00Z`),
      durationSeconds: minutes * 60,
      readingDate: new Date(`${date}T00:00:00Z`),
    },
  });
}

describe('trainer oversight and reports', () => {
  let ctx: TestContext;
  let trainer: Client;
  let other: Client;
  let admin: Client;
  let student: Client;
  let ids: { a: string; b: string; c: string; outsider: string; classA: string; classB: string };

  beforeAll(async () => {
    ctx = await createTestApp({ clock: () => NOW });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const classA = await createClass(ctx.prisma, 'Class A');
    const classB = await createClass(ctx.prisma, 'Class B');
    const t = await createUser(ctx.prisma, 'TRAINER');
    const t2 = await createUser(ctx.prisma, 'TRAINER');
    const ad = await createUser(ctx.prisma, 'ADMIN');
    const a = await createUser(ctx.prisma, 'STUDENT', {
      classId: classA.id,
      fullName: '=Alice cmd',
    });
    const b = await createUser(ctx.prisma, 'STUDENT', { classId: classA.id, fullName: 'Bopha' });
    const c = await createUser(ctx.prisma, 'STUDENT', { classId: classB.id, fullName: 'Chea' });
    const outsider = await createUser(ctx.prisma, 'STUDENT', {
      classId: classA.id,
      fullName: 'Outsider',
    });
    await ctx.prisma.trainerStudentAssignment.createMany({
      data: [a, b, c].map((s) => ({ trainerId: t.id, studentId: s.id })),
    });
    ids = {
      a: a.id,
      b: b.id,
      c: c.id,
      outsider: outsider.id,
      classA: classA.id,
      classB: classB.id,
    };
    trainer = await loginAs(ctx.app, t.username);
    other = await loginAs(ctx.app, t2.username);
    admin = await loginAs(ctx.app, ad.username);
    student = await loginAs(ctx.app, a.username);

    await addSession(ctx.prisma, a.id, '2026-03-03', 30);
    const s = await addSession(ctx.prisma, a.id, '2026-03-04', 20);
    await ctx.prisma.readingReflection.create({
      data: {
        sessionId: s.id,
        studentId: a.id,
        learned: 'SECRET REFLECTION TEXT',
        understandingRating: 4,
      },
    });
    await addSession(ctx.prisma, b.id, '2026-02-10', 25); // inactive (> 7 days ago)
    await addSession(ctx.prisma, outsider.id, '2026-03-04', 60);
  });

  it('lists only assigned students with range metrics', async () => {
    const res = await trainer.get('/api/v1/trainer/students');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.total).toBe(3);
    expect(body.meta.range).toMatchObject({ from: '2026-02-26', to: '2026-03-04' });
    const alice = body.data.find((r: { student: { id: string } }) => r.student.id === ids.a);
    expect(alice.metrics).toMatchObject({
      rangeSeconds: 3000,
      rangeSessions: 2,
      rangeReadingDays: 2,
      currentStreak: 2,
      lastReadingDate: '2026-03-04',
      inactive: false,
      reflectionsInRange: 1,
      awaitingFeedback: 1,
      goalPercent: 42, // 50 of 120 minutes (7-day range, default weekly goal)
    });
    expect(alice.metrics.currentBook).toBeNull(); // test books are PLANNED
    const names = body.data.map((r: { student: { fullName: string } }) => r.student.fullName);
    expect(names).not.toContain('Outsider');
  });

  it('filters by class, search and inactivity', async () => {
    const byClass = await trainer.get(`/api/v1/trainer/students?classId=${ids.classB}`);
    expect(byClass.json().data.map((r: { student: { id: string } }) => r.student.id)).toEqual([
      ids.c,
    ]);
    const search = await trainer.get('/api/v1/trainer/students?search=boph');
    expect(search.json().meta.total).toBe(1);
    const inactive = await trainer.get('/api/v1/trainer/students?inactiveOnly=true');
    expect(
      inactive
        .json()
        .data.map((r: { student: { id: string } }) => r.student.id)
        .sort(),
    ).toEqual([ids.b, ids.c].sort());
  });

  it('lets admins filter by account status and missing trainer, and shows trainers', async () => {
    await ctx.prisma.user.update({ where: { id: ids.b }, data: { status: 'INACTIVE' } });
    const active = (await admin.get('/api/v1/trainer/students?pageSize=50')).json();
    expect(active.meta.total).toBe(3); // a, c, outsider (b deactivated)
    const alice = active.data.find((r: { student: { id: string } }) => r.student.id === ids.a);
    expect(alice.trainers.map((t: { fullName: string }) => t.fullName)).toHaveLength(1);
    const inactive = (await admin.get('/api/v1/trainer/students?accountStatus=INACTIVE')).json();
    expect(inactive.data.map((r: { student: { id: string } }) => r.student.id)).toEqual([ids.b]);
    const all = (await admin.get('/api/v1/trainer/students?accountStatus=ALL')).json();
    expect(all.meta.total).toBe(4);
    const noTrainer = (await admin.get('/api/v1/trainer/students?unassigned=true')).json();
    expect(noTrainer.data.map((r: { student: { id: string } }) => r.student.id)).toEqual([
      ids.outsider,
    ]);
    const trainers = (await admin.get('/api/v1/admin/users?role=TRAINER')).json();
    expect(
      trainers.data.map((u: { assignedStudents: number }) => u.assignedStudents).sort(),
    ).toEqual([0, 3]);
  });

  it('blocks access to unassigned students', async () => {
    expect((await trainer.get(`/api/v1/trainer/students/${ids.outsider}/summary`)).statusCode).toBe(
      404,
    );
    expect((await other.get(`/api/v1/trainer/students/${ids.a}/summary`)).statusCode).toBe(404);
    expect((await other.get('/api/v1/trainer/students')).json().meta.total).toBe(0);
    const summary = await trainer.get(`/api/v1/trainer/students/${ids.a}/summary`);
    expect(summary.json().data.summary.time.weekSeconds).toBe(3000);
  });

  it('forbids students from trainer endpoints and reports', async () => {
    expect((await student.get('/api/v1/trainer/students')).statusCode).toBe(403);
    expect((await student.get('/api/v1/trainer/reports/student-summary')).statusCode).toBe(403);
    expect((await trainer.get('/api/v1/admin/reports/student-summary')).statusCode).toBe(403);
  });

  it('computes an aggregate overview', async () => {
    const res = await trainer.get('/api/v1/trainer/overview');
    expect(res.json().data).toMatchObject({
      students: 3,
      activeStudents: 1,
      inactiveStudents: 2,
      pendingFeedback: 1,
      totalSeconds: 3000,
    });
    expect(res.json().data.series).toHaveLength(7);
  });

  describe('reports', () => {
    it('exports a CSV that respects scope, filters and date range', async () => {
      const res = await trainer.get(
        `/api/v1/trainer/reports/student-summary?from=2026-03-04&to=2026-03-04&classId=${ids.classA}`,
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain(
        'student-summary_2026-03-04_2026-03-04.csv',
      );
      const lines = res.body
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines).toHaveLength(3); // header + Alice + Bopha (class A, assigned)
      expect(res.body).not.toContain('Outsider');
      expect(res.body).not.toContain('Chea');
      // Alice: 20 minutes on 4 March only; formula-like name is neutralised.
      const alice = lines.find((l) => l.includes('Alice'))!;
      expect(alice).toContain("'=Alice cmd");
      expect(alice.split(',')[4]).toBe('20');
      expect(await ctx.prisma.auditLog.count({ where: { action: 'report.exported' } })).toBe(1);
    });

    it('never exports reflection text', async () => {
      const res = await trainer.get(
        '/api/v1/trainer/reports/reflections?from=2026-03-01&to=2026-03-04',
      );
      expect(res.body).not.toContain('SECRET REFLECTION TEXT');
      expect(res.body).toContain('Reflection rate %');
    });

    it('requires an authorized student for individual history', async () => {
      expect((await trainer.get('/api/v1/trainer/reports/sessions')).statusCode).toBe(400);
      expect(
        (await trainer.get(`/api/v1/trainer/reports/sessions?studentId=${ids.outsider}`))
          .statusCode,
      ).toBe(404);
      const ok = await trainer.get(
        `/api/v1/trainer/reports/sessions?studentId=${ids.a}&from=2026-03-01&to=2026-03-04&format=json`,
      );
      expect(ok.json().data.rows).toHaveLength(2);
    });

    it('lists inactive students and lets admins report on everyone', async () => {
      const inactive = await trainer.get('/api/v1/trainer/reports/inactive-students?format=json');
      expect(
        inactive
          .json()
          .data.rows.map((r: string[]) => r[1])
          .sort(),
      ).toEqual(['Bopha', 'Chea']);
      const all = await admin.get('/api/v1/admin/reports/student-summary?format=json');
      expect(all.json().data.rows).toHaveLength(4);
    });

    it('summarises reading per week and per month', async () => {
      const weekly = await trainer.get(
        `/api/v1/trainer/reports/period-summary?from=2026-03-01&to=2026-03-04&classId=${ids.classA}&format=json`,
      );
      const data = weekly.json().data;
      expect(data.headers[0]).toBe('Week starting');
      const alice = data.rows.filter((r: (string | number)[]) => r[2] === '=Alice cmd');
      // Sunday 1 March belongs to the week starting Monday 23 February.
      expect(alice).toEqual([
        ['2026-02-23', expect.any(String), '=Alice cmd', 'Class A', expect.any(String), 0, 0, 0, 0],
        [
          '2026-03-02',
          expect.any(String),
          '=Alice cmd',
          'Class A',
          expect.any(String),
          50,
          2,
          2,
          0,
        ],
      ]);
      const monthly = await trainer.get(
        '/api/v1/trainer/reports/period-summary?from=2026-02-01&to=2026-03-31&granularity=month&format=json',
      );
      const bopha = monthly.json().data.rows.filter((r: (string | number)[]) => r[2] === 'Bopha');
      expect(bopha.map((r: (string | number)[]) => [r[0], r[5]])).toEqual([
        ['2026-02-01', 25],
        ['2026-03-01', 0],
      ]);
    });

    it('rejects invalid ranges', async () => {
      const res = await trainer.get(
        '/api/v1/trainer/reports/daily-activity?from=2026-03-05&to=2026-03-01',
      );
      expect(res.statusCode).toBe(400);
    });
  });
});

describe('csv helpers', () => {
  it('quotes and neutralises dangerous cells', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(toCsv(['h'], [['ស្រី']])).toBe('\uFEFFh\r\nស្រី\r\n');
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

const pageCount = (pdf: string) => (pdf.match(/\/Type \/Page[^s]/g) ?? []).length;

describe('reflection PDF export', () => {
  let ctx: TestContext;
  let alice: Client;
  let bob: Client;
  let trainer: Client;
  let outsider: Client;
  let admin: Client;
  let aliceId: string;
  let reflectionId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'STUDENT', { fullName: 'ស្រីនាង សុខ' });
    const b = await createUser(ctx.prisma, 'STUDENT');
    const t = await createUser(ctx.prisma, 'TRAINER');
    const o = await createUser(ctx.prisma, 'TRAINER');
    const ad = await createUser(ctx.prisma, 'ADMIN');
    await ctx.prisma.trainerStudentAssignment.create({
      data: { trainerId: t.id, studentId: a.id },
    });
    aliceId = a.id;
    alice = await loginAs(ctx.app, a.username);
    bob = await loginAs(ctx.app, b.username);
    trainer = await loginAs(ctx.app, t.username);
    outsider = await loginAs(ctx.app, o.username);
    admin = await loginAs(ctx.app, ad.username);
    const lib = await ctx.prisma.libraryBook.create({
      data: { title: 'សៀវភៅ ទម្លាប់ល្អ', author: 'James Clear', normalizedKey: 'x|' },
    });
    const sb = await ctx.prisma.studentBook.create({
      data: { studentId: a.id, libraryBookId: lib.id },
    });
    const long =
      'ការអានជារៀងរាល់ថ្ងៃ ជួយឲ្យខ្ញុំរៀនបានច្រើន។ Reading every day helps me learn. '.repeat(45);
    for (let d = 1; d <= 3; d++) {
      const session = await ctx.prisma.readingSession.create({
        data: {
          studentId: a.id,
          studentBookId: sb.id,
          status: 'COMPLETED',
          startedAt: new Date(`2026-03-0${d}T03:00:00Z`),
          endedAt: new Date(`2026-03-0${d}T03:30:00Z`),
          durationSeconds: 1800,
          readingDate: new Date(`2026-03-0${d}T00:00:00Z`),
          startPage: d * 10,
          endPage: d * 10 + 8,
        },
      });
      const r = await ctx.prisma.readingReflection.create({
        data: {
          sessionId: session.id,
          studentId: a.id,
          whatRead: `Chapter ${d}`,
          learned: d === 1 ? long : 'ខ្ញុំបានរៀនអំពីទម្លាប់ល្អ',
          keyTakeaway: 'Small steady reading beats long rare sessions',
          understandingRating: 4,
        },
      });
      if (d === 1) reflectionId = r.id;
    }
  });

  it('lets a student download their own reflection as a PDF', async () => {
    const res = await alice.get(`/api/v1/reflections/${reflectionId}/pdf`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="reflection_2026-03-01.pdf"',
    );
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // Long mixed Khmer/English text flows onto a second page.
    expect(pageCount(res.rawPayload.toString('latin1'))).toBeGreaterThanOrEqual(2);
    // Students' own downloads are not audited.
    expect(await ctx.prisma.auditLog.count({ where: { action: 'reflection.exported' } })).toBe(0);
  });

  it("refuses other students' reflections", async () => {
    expect((await bob.get(`/api/v1/reflections/${reflectionId}/pdf`)).statusCode).toBe(404);
    // A student's export always covers themselves, whatever studentId is passed.
    const own = await bob.get(`/api/v1/reflections/export.pdf?studentId=${aliceId}`);
    expect(own.statusCode).toBe(404); // bob has no reflections
  });

  it('exports all reflections of an assigned student for trainers, audited', async () => {
    const res = await trainer.get(`/api/v1/reflections/export.pdf?studentId=${aliceId}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/reflections_t-\d+\.pdf/);
    // Summary page + one page per reflection (the long one takes two).
    expect(pageCount(res.rawPayload.toString('latin1'))).toBeGreaterThanOrEqual(4);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'reflection.exported' },
    });
    expect(log.metadata).toMatchObject({ count: 3 });

    const ranged = await trainer.get(
      `/api/v1/reflections/export.pdf?studentId=${aliceId}&from=2026-03-02&to=2026-03-02`,
    );
    expect(ranged.statusCode).toBe(200);
    expect(
      (
        await ctx.prisma.auditLog.findFirstOrThrow({
          where: { action: 'reflection.exported' },
          orderBy: { createdAt: 'desc' },
        })
      ).metadata,
    ).toMatchObject({ count: 1 });
  });

  it('blocks unassigned trainers and requires a student for staff exports', async () => {
    expect((await outsider.get(`/api/v1/reflections/${reflectionId}/pdf`)).statusCode).toBe(404);
    expect(
      (await outsider.get(`/api/v1/reflections/export.pdf?studentId=${aliceId}`)).statusCode,
    ).toBe(404);
    expect((await trainer.get('/api/v1/reflections/export.pdf')).statusCode).toBe(400);
    expect(
      (await admin.get(`/api/v1/reflections/export.pdf?studentId=${aliceId}`)).statusCode,
    ).toBe(200);
  });

  it('returns 404 when the selection has no reflections', async () => {
    const res = await alice.get('/api/v1/reflections/export.pdf?from=2027-01-01');
    expect(res.statusCode).toBe(404);
  });
});

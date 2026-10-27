import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

async function completedSession(prisma: PrismaClient, studentId: string, title = 'Cosmos') {
  const lib = await prisma.libraryBook.create({
    data: { title, normalizedKey: `${title.toLowerCase()}|${Math.random()}` },
  });
  const sb = await prisma.studentBook.create({ data: { studentId, libraryBookId: lib.id } });
  return prisma.readingSession.create({
    data: {
      studentId,
      studentBookId: sb.id,
      status: 'COMPLETED',
      startedAt: new Date('2026-03-01T03:00:00Z'),
      endedAt: new Date('2026-03-01T03:30:00Z'),
      durationSeconds: 1800,
      readingDate: new Date('2026-03-01T00:00:00Z'),
    },
  });
}

describe('reflections and trainer feedback', () => {
  let ctx: TestContext;
  let alice: Client;
  let bob: Client;
  let trainer: Client;
  let outsider: Client;
  let aliceId: string;
  let sessionId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'STUDENT');
    const b = await createUser(ctx.prisma, 'STUDENT');
    const t = await createUser(ctx.prisma, 'TRAINER', { fullName: 'Teacher Dara' });
    const o = await createUser(ctx.prisma, 'TRAINER');
    await ctx.prisma.trainerStudentAssignment.create({
      data: { trainerId: t.id, studentId: a.id },
    });
    aliceId = a.id;
    alice = await loginAs(ctx.app, a.username);
    bob = await loginAs(ctx.app, b.username);
    trainer = await loginAs(ctx.app, t.username);
    outsider = await loginAs(ctx.app, o.username);
    sessionId = (await completedSession(ctx.prisma, a.id)).id;
  });

  const create = (body: Record<string, unknown> = {}) =>
    alice.post('/api/v1/reflections', {
      sessionId,
      whatRead: 'Chapter 1: The shores of the cosmic ocean',
      learned: 'ខ្ញុំបានរៀនអំពីផ្កាយ', // Khmer text
      understandingRating: 4,
      tags: ['Science', 'science', ' Space '],
      ...body,
    });

  it('creates a reflection linked to the session, preserving Khmer text', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      sessionId,
      learned: 'ខ្ញុំបានរៀនអំពីផ្កាយ',
      understandingRating: 4,
      tags: ['science', 'space'],
      book: { title: 'Cosmos' },
      session: { readingDate: '2026-03-01', durationSeconds: 1800 },
    });
    const history = await alice.get('/api/v1/reading-sessions');
    expect(history.json().data[0].reflectionId).toBe(res.json().data.id);
  });

  it('allows partial reflections but not empty ones', async () => {
    expect(
      (await create({ whatRead: '', learned: '  ', understandingRating: null })).statusCode,
    ).toBe(400);
    const partial = await alice.post('/api/v1/reflections', {
      sessionId,
      keyTakeaway: 'Be curious',
    });
    expect(partial.statusCode).toBe(201);
  });

  it('validates the understanding rating', async () => {
    expect((await create({ understandingRating: 6 })).statusCode).toBe(400);
    expect((await create({ understandingRating: 0 })).statusCode).toBe(400);
  });

  it('allows only one reflection per session and only for finished sessions', async () => {
    await create();
    const dup = await create();
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('REFLECTION_EXISTS');

    const running = await ctx.prisma.readingSession.update({
      where: { id: sessionId },
      data: { status: 'READING', endedAt: null, lastResumedAt: new Date() },
    });
    await ctx.prisma.readingReflection.deleteMany();
    const res = await alice.post('/api/v1/reflections', { sessionId: running.id, learned: 'x' });
    expect(res.json().error.code).toBe('SESSION_NOT_COMPLETED');
  });

  it('edits a reflection and keeps created/updated timestamps', async () => {
    const created = (await create()).json().data;
    await new Promise((r) => setTimeout(r, 20));
    const res = await alice.patch(`/api/v1/reflections/${created.id}`, {
      application: 'Observe the night sky weekly',
      tags: ['astronomy'],
    });
    const updated = res.json().data;
    expect(updated.application).toBe('Observe the night sky weekly');
    expect(updated.whatRead).toBe(created.whatRead);
    expect(updated.tags).toEqual(['astronomy']);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.updatedAt).getTime(),
    );
  });

  it('searches notes (including Khmer) and filters by book, tag and date', async () => {
    await create();
    const other = await completedSession(ctx.prisma, aliceId, 'Sapiens');
    await alice.post('/api/v1/reflections', {
      sessionId: other.id,
      learned: 'Cognitive revolution',
      tags: ['history'],
    });
    const khmer = await alice.get(`/api/v1/reflections?search=${encodeURIComponent('ផ្កាយ')}`);
    expect(khmer.json().meta.total).toBe(1);
    const english = await alice.get('/api/v1/reflections?search=COGNITIVE');
    expect(english.json().data[0].book.title).toBe('Sapiens');
    const byTag = await alice.get('/api/v1/reflections?tag=history');
    expect(byTag.json().meta.total).toBe(1);
    const byDate = await alice.get('/api/v1/reflections?from=2026-03-02');
    expect(byDate.json().meta.total).toBe(0);
    const studentBookId = english.json().data[0].book.studentBookId;
    const byBook = await alice.get(`/api/v1/reflections?studentBookId=${studentBookId}`);
    expect(byBook.json().meta.total).toBe(1);
  });

  it("prevents students from reading or editing others' reflections", async () => {
    const created = (await create()).json().data;
    expect((await bob.get(`/api/v1/reflections/${created.id}`)).statusCode).toBe(404);
    expect(
      (await bob.patch(`/api/v1/reflections/${created.id}`, { learned: 'hacked' })).statusCode,
    ).toBe(404);
    expect((await bob.get('/api/v1/reflections')).json().meta.total).toBe(0);
    expect((await bob.post('/api/v1/reflections', { sessionId, learned: 'x' })).statusCode).toBe(
      404,
    );
    expect(
      (await bob.post(`/api/v1/reflections/${created.id}/feedback`, { body: 'x' })).statusCode,
    ).toBe(403);
  });

  it('lets assigned trainers review and give feedback that the student sees', async () => {
    const created = (await create()).json().data;
    const queue = await trainer.get('/api/v1/reflections?needsFeedback=true');
    expect(queue.json().meta.total).toBe(1);

    const fb = await trainer.post(`/api/v1/reflections/${created.id}/feedback`, {
      body: 'Great observations! Try connecting them to your science class.',
    });
    expect(fb.statusCode).toBe(201);
    expect((await trainer.get('/api/v1/reflections?needsFeedback=true')).json().meta.total).toBe(0);

    const seen = await alice.get(`/api/v1/reflections/${created.id}`);
    expect(seen.json().data.feedback).toEqual([
      expect.objectContaining({ trainer: expect.objectContaining({ fullName: 'Teacher Dara' }) }),
    ]);
    // Trainers cannot edit the student's reflection.
    expect(
      (await trainer.patch(`/api/v1/reflections/${created.id}`, { learned: 'x' })).statusCode,
    ).toBe(403);
    // Audit records the action but not the feedback text.
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'feedback.created' },
    });
    expect(JSON.stringify(log.metadata)).not.toContain('Great observations');
  });

  it('hides reflections of unassigned students from other trainers', async () => {
    const created = (await create()).json().data;
    expect((await outsider.get(`/api/v1/reflections/${created.id}`)).statusCode).toBe(404);
    expect((await outsider.get('/api/v1/reflections')).json().meta.total).toBe(0);
    expect(
      (await outsider.post(`/api/v1/reflections/${created.id}/feedback`, { body: 'x' })).statusCode,
    ).toBe(404);
  });

  it('lets trainers edit only their own feedback', async () => {
    const created = (await create()).json().data;
    const fb = (
      await trainer.post(`/api/v1/reflections/${created.id}/feedback`, { body: 'First' })
    ).json().data.feedback[0];
    const edited = await trainer.patch(`/api/v1/reflections/${created.id}/feedback/${fb.id}`, {
      body: 'Edited',
    });
    expect(edited.json().data.feedback[0].body).toBe('Edited');
    const other = await outsider.patch(`/api/v1/reflections/${created.id}/feedback/${fb.id}`, {
      body: 'x',
    });
    expect(other.statusCode).toBe(404);
  });
});

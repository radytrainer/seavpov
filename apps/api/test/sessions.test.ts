import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

/** Controllable server clock. Default: 2026-03-02 10:00 in Asia/Phnom_Penh (UTC+7). */
let now = new Date('2026-03-02T03:00:00Z');
const advance = (minutes: number) => {
  now = new Date(now.getTime() + minutes * 60_000);
};
const at = (iso: string) => {
  now = new Date(iso);
};

describe('reading sessions & timer', () => {
  let ctx: TestContext;
  let alice: Client;
  let bob: Client;
  let aliceId: string;
  let bookId: string; // alice's student book (200 pages)

  beforeAll(async () => {
    ctx = await createTestApp({ clock: () => now });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    at('2026-03-02T03:00:00Z');
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'STUDENT');
    const b = await createUser(ctx.prisma, 'STUDENT');
    aliceId = a.id;
    alice = await loginAs(ctx.app, a.username);
    bob = await loginAs(ctx.app, b.username);
    const lib = await ctx.prisma.libraryBook.create({
      data: { title: 'Cosmos', normalizedKey: 'cosmos|', totalPages: 200 },
    });
    bookId = (
      await ctx.prisma.studentBook.create({
        data: { studentId: a.id, libraryBookId: lib.id, currentPage: 10 },
      })
    ).id;
  });

  const start = (body: Record<string, unknown> = {}) =>
    alice.post('/api/v1/reading-sessions/start', { studentBookId: bookId, ...body });

  async function startedId() {
    const res = await start();
    expect(res.statusCode).toBe(201);
    return res.json().data.id as string;
  }

  describe('state machine', () => {
    it('starts with server timestamps and the book current page', async () => {
      const res = await start();
      const s = res.json().data;
      expect(s).toMatchObject({
        status: 'READING',
        source: 'TIMER',
        method: 'PHYSICAL_BOOK',
        startPage: 10,
        durationSeconds: 0,
        readingDate: '2026-03-02',
      });
      expect(s.startedAt).toBe(now.toISOString());
      const book = await ctx.prisma.studentBook.findUniqueOrThrow({ where: { id: bookId } });
      expect(book.status).toBe('READING');
      expect(book.startedAt).not.toBeNull();
    });

    it('excludes paused time from the duration', async () => {
      const id = await startedId();
      advance(5);
      const paused = await alice.post(`/api/v1/reading-sessions/${id}/pause`);
      expect(paused.json().data).toMatchObject({ status: 'PAUSED', durationSeconds: 300 });
      advance(30); // break — must not count
      expect((await alice.post(`/api/v1/reading-sessions/${id}/resume`)).statusCode).toBe(200);
      advance(3);
      const finished = await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: 25 });
      expect(finished.json().data).toMatchObject({
        status: 'COMPLETED',
        durationSeconds: 480,
        endPage: 25,
        pagesRead: 15,
      });
    });

    it('restores the timer from persisted state after a refresh', async () => {
      const id = await startedId();
      advance(7);
      // "Refresh": a new request for the active session computes elapsed time on the server.
      const active = await alice.get('/api/v1/reading-sessions/active');
      expect(active.json().data).toMatchObject({ id, status: 'READING', elapsedSeconds: 420 });
      expect(active.json().meta.serverNow).toBe(now.toISOString());
      // Signing in again (new session cookie) restores the same timer.
      const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: aliceId } });
      const again = await loginAs(ctx.app, user.username);
      expect((await again.get('/api/v1/reading-sessions/active')).json().data.id).toBe(id);
    });

    it('rejects invalid transitions', async () => {
      const id = await startedId();
      const resume = await alice.post(`/api/v1/reading-sessions/${id}/resume`);
      expect(resume.statusCode).toBe(409);
      expect(resume.json().error.code).toBe('INVALID_TRANSITION');
      await alice.post(`/api/v1/reading-sessions/${id}/pause`);
      expect((await alice.post(`/api/v1/reading-sessions/${id}/pause`)).statusCode).toBe(409);
      await alice.post(`/api/v1/reading-sessions/${id}/finish`);
      for (const action of ['pause', 'resume', 'finish', 'cancel']) {
        expect((await alice.post(`/api/v1/reading-sessions/${id}/${action}`)).statusCode).toBe(409);
      }
    });

    it('allows only one active session per student, even under concurrent starts', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => start()));
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([201, 409, 409, 409, 409]);
      const conflictBody = results.find((r) => r.statusCode === 409)!.json();
      expect(conflictBody.error.code).toBe('ACTIVE_SESSION_EXISTS');
      expect(conflictBody.error.details.sessionId).toBeDefined();
      expect(await ctx.prisma.readingSession.count()).toBe(1);
    });

    it('does not double-count duplicate finish or pause requests', async () => {
      const id = await startedId();
      advance(10);
      const pauses = await Promise.all([
        alice.post(`/api/v1/reading-sessions/${id}/pause`),
        alice.post(`/api/v1/reading-sessions/${id}/pause`),
      ]);
      expect(pauses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      await alice.post(`/api/v1/reading-sessions/${id}/resume`);
      advance(5);
      const finishes = await Promise.all([
        alice.post(`/api/v1/reading-sessions/${id}/finish`),
        alice.post(`/api/v1/reading-sessions/${id}/finish`),
      ]);
      expect(finishes.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      const row = await ctx.prisma.readingSession.findUniqueOrThrow({ where: { id } });
      expect(row.durationSeconds).toBe(900);
    });

    it('ignores durations or timestamps sent by the browser', async () => {
      const id = await startedId();
      advance(2);
      const res = await alice.post(`/api/v1/reading-sessions/${id}/finish`, {
        durationSeconds: 99_999,
        endedAt: '2030-01-01T00:00:00Z',
        studentId: 'someone-else',
      });
      expect(res.json().data.durationSeconds).toBe(120);
      expect(res.json().data.endedAt).toBe(now.toISOString());
    });

    it('caps forgotten timers at the configured maximum', async () => {
      const id = await startedId();
      advance(5 * 60); // 5 h, default max is 240 min
      const res = await alice.post(`/api/v1/reading-sessions/${id}/finish`);
      expect(res.json().data).toMatchObject({ durationSeconds: 240 * 60, durationCapped: true });
    });

    it('counts a session that crosses midnight toward the day it started', async () => {
      at('2026-03-02T16:50:00Z'); // 23:50 local
      const id = await startedId();
      advance(30); // 00:20 local on 3 March
      const res = await alice.post(`/api/v1/reading-sessions/${id}/finish`);
      expect(res.json().data).toMatchObject({ readingDate: '2026-03-02', durationSeconds: 1800 });
    });

    it('discards (cancels) a session and hides it from history by default', async () => {
      const id = await startedId();
      const res = await alice.post(`/api/v1/reading-sessions/${id}/cancel`);
      expect(res.json().data.status).toBe('CANCELLED');
      expect((await alice.get('/api/v1/reading-sessions')).json().meta.total).toBe(0);
      expect(
        (await alice.get('/api/v1/reading-sessions?includeCancelled=true')).json().meta.total,
      ).toBe(1);
      // The slot is free again.
      expect((await start()).statusCode).toBe(201);
    });
  });

  describe('pages and progress', () => {
    it('updates book progress in the same transaction', async () => {
      const id = await startedId();
      advance(10);
      await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: 42, note: 'Good' });
      const book = await ctx.prisma.studentBook.findUniqueOrThrow({ where: { id: bookId } });
      expect(book.currentPage).toBe(42);
      expect(book.lastReadAt?.toISOString()).toBe(now.toISOString());
    });

    it('rejects invalid page ranges without changing the session', async () => {
      const id = await startedId();
      const before = await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: 5 });
      expect(before.statusCode).toBe(400);
      const beyond = await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: 201 });
      expect(beyond.statusCode).toBe(400);
      const negative = await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: -1 });
      expect(negative.statusCode).toBe(400);
      const row = await ctx.prisma.readingSession.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('READING');
      expect((await start({ startPage: 500 })).statusCode).toBe(400); // beyond the book
      expect((await start()).statusCode).toBe(409); // still active
    });

    it('can mark the book completed when finishing', async () => {
      const id = await startedId();
      advance(10);
      await alice.post(`/api/v1/reading-sessions/${id}/finish`, { markBookCompleted: true });
      const book = await ctx.prisma.studentBook.findUniqueOrThrow({ where: { id: bookId } });
      expect(book).toMatchObject({ status: 'COMPLETED', currentPage: 200 });
      expect((await start()).json().error.code).toBe('BOOK_NOT_ACTIVE');
    });

    it('cannot start reading an archived book', async () => {
      await ctx.prisma.studentBook.update({ where: { id: bookId }, data: { archivedAt: now } });
      expect((await start()).statusCode).toBe(400);
    });
  });

  describe('manual entries', () => {
    const manual = (body: Record<string, unknown>) =>
      alice.post('/api/v1/reading-sessions/manual', { studentBookId: bookId, ...body });

    it('records a manual session with a server-computed duration', async () => {
      const res = await manual({
        startedAt: '2026-03-01T12:00:00Z',
        endedAt: '2026-03-01T12:45:00Z',
        startPage: 10,
        endPage: 30,
        durationSeconds: 1, // ignored
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().data).toMatchObject({
        source: 'MANUAL',
        status: 'COMPLETED',
        durationSeconds: 2700,
        readingDate: '2026-03-01',
        pagesRead: 20,
      });
      expect(await ctx.prisma.auditLog.count({ where: { action: 'session.manual_created' } })).toBe(
        1,
      );
    });

    it('rejects invalid timestamps', async () => {
      const cases = [
        { startedAt: '2026-03-01T12:00:00Z', endedAt: '2026-03-01T11:00:00Z' }, // end before start
        { startedAt: '2026-03-02T03:30:00Z', endedAt: '2026-03-02T04:00:00Z' }, // future
        { startedAt: '2026-02-01T03:00:00Z', endedAt: '2026-02-01T04:00:00Z' }, // too old
        { startedAt: '2026-03-01T00:00:00Z', endedAt: '2026-03-01T05:00:00Z' }, // > 240 min
        { startedAt: 'yesterday', endedAt: '2026-03-01T05:00:00Z' }, // malformed
      ];
      for (const body of cases) {
        const res = await manual(body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
      }
    });

    it('warns about overlapping sessions instead of double counting', async () => {
      await manual({ startedAt: '2026-03-01T12:00:00Z', endedAt: '2026-03-01T13:00:00Z' });
      const overlap = await manual({
        startedAt: '2026-03-01T12:30:00Z',
        endedAt: '2026-03-01T13:30:00Z',
      });
      expect(overlap.statusCode).toBe(409);
      expect(overlap.json().error.code).toBe('SESSION_OVERLAP');
      expect(overlap.json().error.details.overlaps).toHaveLength(1);
      // Adjacent (touching) sessions are fine.
      const adjacent = await manual({
        startedAt: '2026-03-01T13:00:00Z',
        endedAt: '2026-03-01T13:20:00Z',
      });
      expect(adjacent.statusCode).toBe(201);
    });

    it('treats a running timer as occupying time until now', async () => {
      at('2026-03-02T02:00:00Z');
      await startedId();
      at('2026-03-02T03:00:00Z');
      const res = await manual({
        startedAt: '2026-03-02T02:30:00Z',
        endedAt: '2026-03-02T02:50:00Z',
      });
      expect(res.statusCode).toBe(409);
    });

    it('never moves progress backwards for back-dated entries', async () => {
      await ctx.prisma.studentBook.update({ where: { id: bookId }, data: { currentPage: 100 } });
      await manual({
        startedAt: '2026-03-01T12:00:00Z',
        endedAt: '2026-03-01T12:30:00Z',
        startPage: 20,
        endPage: 40,
      });
      const book = await ctx.prisma.studentBook.findUniqueOrThrow({ where: { id: bookId } });
      expect(book.currentPage).toBe(100);
    });
  });

  describe('edits', () => {
    it('keeps timed-session timestamps immutable but allows pages and notes', async () => {
      const id = await startedId();
      advance(10);
      await alice.post(`/api/v1/reading-sessions/${id}/finish`, { endPage: 20 });
      const timeEdit = await alice.patch(`/api/v1/reading-sessions/${id}`, {
        startedAt: '2026-03-02T01:00:00Z',
      });
      expect(timeEdit.statusCode).toBe(400);
      const ok = await alice.patch(`/api/v1/reading-sessions/${id}`, {
        endPage: 30,
        note: 'ទំព័រ ១០ ដល់ ៣០',
      });
      expect(ok.json().data).toMatchObject({ endPage: 30, note: 'ទំព័រ ១០ ដល់ ៣០' });
      const badRange = await alice.patch(`/api/v1/reading-sessions/${id}`, { endPage: 2 });
      expect(badRange.statusCode).toBe(400);
    });

    it('recalculates manual-session durations and audits the change', async () => {
      const created = await alice.post('/api/v1/reading-sessions/manual', {
        studentBookId: bookId,
        startedAt: '2026-03-01T12:00:00Z',
        endedAt: '2026-03-01T12:30:00Z',
      });
      const id = created.json().data.id;
      const res = await alice.patch(`/api/v1/reading-sessions/${id}`, {
        endedAt: '2026-03-01T12:50:00Z',
      });
      expect(res.json().data.durationSeconds).toBe(3000);
      const log = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'session.edited' },
      });
      expect(log.metadata).toMatchObject({
        before: { durationSeconds: 1800 },
        after: { durationSeconds: 3000 },
      });
      // Note text is never copied into the audit log.
      expect(log.metadata).not.toHaveProperty('note');
    });
  });

  describe('administrative void', () => {
    it('lets only administrators void a session, with a reason, and excludes it from metrics', async () => {
      const id = await startedId();
      advance(30);
      await alice.post(`/api/v1/reading-sessions/${id}/finish`);
      const before = (await alice.get('/api/v1/analytics/me')).json().data;
      expect(before.time.todaySeconds).toBe(1800);

      const trainer = await createUser(ctx.prisma, 'TRAINER');
      await ctx.prisma.trainerStudentAssignment.create({
        data: { trainerId: trainer.id, studentId: aliceId },
      });
      const t = await loginAs(ctx.app, trainer.username);
      expect(
        (await t.post(`/api/v1/reading-sessions/${id}/void`, { reason: 'Not genuine' })).statusCode,
      ).toBe(403);
      expect(
        (await alice.post(`/api/v1/reading-sessions/${id}/void`, { reason: 'Not genuine' }))
          .statusCode,
      ).toBe(403);

      const adminUser = await createUser(ctx.prisma, 'ADMIN');
      const admin = await loginAs(ctx.app, adminUser.username);
      expect(
        (await admin.post(`/api/v1/reading-sessions/${id}/void`, { reason: '' })).statusCode,
      ).toBe(400);
      const res = await admin.post(`/api/v1/reading-sessions/${id}/void`, {
        reason: 'Timer left running during class',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('CANCELLED');
      expect(
        (await admin.post(`/api/v1/reading-sessions/${id}/void`, { reason: 'again please' }))
          .statusCode,
      ).toBe(409);

      const after = (await alice.get('/api/v1/analytics/me')).json().data;
      expect(after.time.todaySeconds).toBe(0);
      const log = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'session.voided' },
      });
      expect(log.metadata).toMatchObject({
        reason: 'Timer left running during class',
        durationSeconds: 1800,
        studentId: aliceId,
      });
    });
  });

  describe('authorization', () => {
    it("blocks access to another student's sessions", async () => {
      const id = await startedId();
      for (const action of ['pause', 'finish', 'cancel']) {
        expect((await bob.post(`/api/v1/reading-sessions/${id}/${action}`)).statusCode).toBe(404);
      }
      expect((await bob.get(`/api/v1/reading-sessions/${id}`)).statusCode).toBe(404);
      expect((await bob.patch(`/api/v1/reading-sessions/${id}`, { note: 'x' })).statusCode).toBe(
        404,
      );
      expect(
        (await bob.post('/api/v1/reading-sessions/start', { studentBookId: bookId })).statusCode,
      ).toBe(404);
      expect(
        (await bob.get(`/api/v1/reading-sessions?studentId=${aliceId}`)).json().meta.total,
      ).toBe(0);
    });

    it('lets assigned trainers view but never change sessions', async () => {
      const trainer = await createUser(ctx.prisma, 'TRAINER');
      const outsider = await createUser(ctx.prisma, 'TRAINER');
      await ctx.prisma.trainerStudentAssignment.create({
        data: { trainerId: trainer.id, studentId: aliceId },
      });
      const t = await loginAs(ctx.app, trainer.username);
      const o = await loginAs(ctx.app, outsider.username);
      const id = await startedId();
      expect((await t.get(`/api/v1/reading-sessions/${id}`)).statusCode).toBe(200);
      expect((await o.get(`/api/v1/reading-sessions/${id}`)).statusCode).toBe(404);
      expect((await t.post(`/api/v1/reading-sessions/${id}/finish`)).statusCode).toBe(403);
      expect((await t.patch(`/api/v1/reading-sessions/${id}`, { note: 'x' })).statusCode).toBe(403);
    });
  });
});

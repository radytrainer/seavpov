import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  SESSION_SOURCES,
  SESSION_STATUSES,
  addDays,
  elapsedSeconds,
  nextTimerState,
  toLocalDate,
  type FinishSessionInput,
  type ManualSessionInput,
  type SessionStatus,
  type StartSessionInput,
  type TimerAction,
  type UpdateSessionInput,
} from '@rt/shared';
import { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { visibleStudentFilter } from '../../lib/access';
import { audit } from '../../lib/audit';
import type { AppError } from '../../lib/errors';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';
import { getSettings } from '../../lib/settings';

type Tx = Prisma.TransactionClient;

export const sessionSelect = {
  id: true,
  studentId: true,
  studentBookId: true,
  source: true,
  status: true,
  startedAt: true,
  endedAt: true,
  lastResumedAt: true,
  durationSeconds: true,
  durationCapped: true,
  readingDate: true,
  startPage: true,
  endPage: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  reflection: { select: { id: true } },
  studentBook: {
    select: {
      id: true,
      totalPages: true,
      libraryBook: { select: { title: true, author: true, totalPages: true } },
    },
  },
} satisfies Prisma.ReadingSessionSelect;

type SessionRecord = Prisma.ReadingSessionGetPayload<{ select: typeof sessionSelect }>;

export const sessionDto = z.object({
  id: z.string(),
  studentId: z.string(),
  studentBookId: z.string(),
  source: z.enum(SESSION_SOURCES),
  method: z.literal('PHYSICAL_BOOK'),
  status: z.enum(SESSION_STATUSES),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  lastResumedAt: z.date().nullable(),
  /** Accumulated seconds in completed segments (authoritative once finished). */
  durationSeconds: z.number(),
  /** durationSeconds plus the running segment, computed on the server at response time. */
  elapsedSeconds: z.number(),
  durationCapped: z.boolean(),
  readingDate: z.string(),
  startPage: z.number().nullable(),
  endPage: z.number().nullable(),
  pagesRead: z.number().nullable(),
  note: z.string().nullable(),
  reflectionId: z.string().nullable(),
  book: z.object({
    title: z.string(),
    author: z.string().nullable(),
    totalPages: z.number().nullable(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SessionDto = z.infer<typeof sessionDto>;

export function toSessionDto(r: SessionRecord, now: Date): SessionDto {
  const { reflection, studentBook, readingDate, ...rest } = r;
  return {
    ...rest,
    method: 'PHYSICAL_BOOK',
    elapsedSeconds: elapsedSeconds(r, now),
    readingDate: readingDate.toISOString().slice(0, 10),
    pagesRead: r.startPage != null && r.endPage != null ? r.endPage - r.startPage : null,
    reflectionId: reflection?.id ?? null,
    book: {
      title: studentBook.libraryBook.title,
      author: studentBook.libraryBook.author,
      totalPages: studentBook.totalPages ?? studentBook.libraryBook.totalPages,
    },
  };
}

/** Stores a local calendar date in a DATE column. */
const asDateColumn = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

function invalidTransition(from: SessionStatus, action: TimerAction): AppError {
  return conflict(
    'INVALID_TRANSITION',
    `Cannot ${action} a session that is ${from.toLowerCase()}`,
    { status: from, action },
  );
}

async function ownBook(tx: Tx, actor: AuthContext, studentBookId: string) {
  const book = await tx.studentBook.findFirst({
    where: { id: studentBookId, studentId: actor.userId },
    select: {
      id: true,
      status: true,
      currentPage: true,
      totalPages: true,
      startedAt: true,
      lastReadAt: true,
      archivedAt: true,
      libraryBook: { select: { totalPages: true } },
    },
  });
  if (!book) throw notFound('Book');
  return { ...book, effectivePages: book.totalPages ?? book.libraryBook.totalPages };
}

function assertPageWithinBook(
  pageNo: number | null | undefined,
  total: number | null,
  field: string,
) {
  if (pageNo != null && total != null && pageNo > total) {
    throw badRequest('Page is beyond the end of the book', [
      { path: field, message: `This book has ${total} pages` },
    ]);
  }
}

async function ownSession(tx: Tx, actor: AuthContext, id: string) {
  const session = await tx.readingSession.findFirst({
    where: { id, studentId: actor.userId },
    select: sessionSelect,
  });
  if (!session) throw notFound('Reading session');
  return session;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getActiveSession(app: FastifyInstance, actor: AuthContext) {
  const row = await app.prisma.readingSession.findFirst({
    where: { studentId: actor.userId, status: { in: ['READING', 'PAUSED'] } },
    select: sessionSelect,
  });
  return row ? toSessionDto(row, app.now()) : null;
}

export async function getSession(app: FastifyInstance, actor: AuthContext, id: string) {
  const row = await app.prisma.readingSession.findFirst({
    where: { AND: [{ id }, visibleStudentFilter(actor)] },
    select: sessionSelect,
  });
  if (!row) throw notFound('Reading session');
  return toSessionDto(row, app.now());
}

export interface ListSessionsQuery {
  page: number;
  pageSize: number;
  studentId?: string;
  studentBookId?: string;
  from?: string;
  to?: string;
  source?: 'TIMER' | 'MANUAL';
  includeCancelled: boolean;
}

export async function listSessions(app: FastifyInstance, actor: AuthContext, q: ListSessionsQuery) {
  const where: Prisma.ReadingSessionWhereInput = {
    AND: [
      visibleStudentFilter(actor),
      q.studentId ? { studentId: q.studentId } : {},
      q.studentBookId ? { studentBookId: q.studentBookId } : {},
      q.source ? { source: q.source } : {},
      q.includeCancelled ? {} : { status: { not: 'CANCELLED' } },
      q.from || q.to
        ? {
            readingDate: {
              gte: q.from ? asDateColumn(q.from) : undefined,
              lte: q.to ? asDateColumn(q.to) : undefined,
            },
          }
        : {},
    ],
  };
  const [rows, total] = await app.prisma.$transaction([
    app.prisma.readingSession.findMany({
      where,
      select: sessionSelect,
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(q),
    }),
    app.prisma.readingSession.count({ where }),
  ]);
  const now = app.now();
  return { items: rows.map((r) => toSessionDto(r, now)), total };
}

// ---------------------------------------------------------------------------
// Timer state machine
// ---------------------------------------------------------------------------

export async function startSession(
  app: FastifyInstance,
  actor: AuthContext,
  input: StartSessionInput,
) {
  const settings = await getSettings(app.prisma);
  const now = app.now();
  try {
    return await app.prisma.$transaction(async (tx) => {
      const book = await ownBook(tx, actor, input.studentBookId);
      if (book.archivedAt) throw badRequest('Restore this book before reading it');
      if (book.status === 'COMPLETED' || book.status === 'ABANDONED') {
        throw conflict(
          'BOOK_NOT_ACTIVE',
          'This book is marked as finished. Change its status to Reading to start a new session.',
        );
      }
      const startPage = input.startPage ?? book.currentPage;
      assertPageWithinBook(startPage, book.effectivePages, 'startPage');

      const created = await tx.readingSession.create({
        data: {
          studentId: actor.userId,
          studentBookId: book.id,
          source: 'TIMER',
          status: 'READING',
          startedAt: now,
          lastResumedAt: now,
          readingDate: asDateColumn(toLocalDate(now, settings.timeZone)),
          startPage,
        },
        select: sessionSelect,
      });
      if (book.status !== 'READING') {
        await tx.studentBook.update({
          where: { id: book.id },
          data: { status: 'READING', startedAt: book.startedAt ?? now },
        });
      }
      return toSessionDto(created, now);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // The partial unique index rejected a second active session (double click, two tabs…).
      const active = await app.prisma.readingSession.findFirst({
        where: { studentId: actor.userId, status: { in: ['READING', 'PAUSED'] } },
        select: { id: true },
      });
      throw conflict('ACTIVE_SESSION_EXISTS', 'You already have a reading session in progress', {
        sessionId: active?.id,
      });
    }
    throw err;
  }
}

/** Seconds of the running segment, and the new total capped at the configured maximum. */
function accrue(session: SessionRecord, now: Date, maxSeconds: number) {
  const total = elapsedSeconds(session, now);
  return { durationSeconds: Math.min(total, maxSeconds), capped: total > maxSeconds };
}

export async function pauseSession(app: FastifyInstance, actor: AuthContext, id: string) {
  const settings = await getSettings(app.prisma);
  const now = app.now();
  return app.prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, actor, id);
    if (!nextTimerState(s.status, 'pause')) throw invalidTransition(s.status, 'pause');
    const { durationSeconds, capped } = accrue(s, now, settings.maxSessionMinutes * 60);
    // Conditional update: a concurrent pause/finish that already changed the row wins.
    const updated = await tx.readingSession.updateMany({
      where: { id, status: 'READING', lastResumedAt: s.lastResumedAt },
      data: {
        status: 'PAUSED',
        lastResumedAt: null,
        durationSeconds,
        durationCapped: s.durationCapped || capped,
      },
    });
    if (updated.count === 0) throw invalidTransition('PAUSED', 'pause');
    return toSessionDto(await ownSession(tx, actor, id), now);
  });
}

export async function resumeSession(app: FastifyInstance, actor: AuthContext, id: string) {
  const now = app.now();
  return app.prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, actor, id);
    if (!nextTimerState(s.status, 'resume')) throw invalidTransition(s.status, 'resume');
    const updated = await tx.readingSession.updateMany({
      where: { id, status: 'PAUSED' },
      data: { status: 'READING', lastResumedAt: now },
    });
    if (updated.count === 0) throw invalidTransition('READING', 'resume');
    return toSessionDto(await ownSession(tx, actor, id), now);
  });
}

export async function finishSession(
  app: FastifyInstance,
  actor: AuthContext,
  id: string,
  input: FinishSessionInput,
) {
  const settings = await getSettings(app.prisma);
  const now = app.now();
  return app.prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, actor, id);
    if (!nextTimerState(s.status, 'finish')) throw invalidTransition(s.status, 'finish');
    const book = await ownBook(tx, actor, s.studentBookId);

    const endPage =
      input.markBookCompleted && book.effectivePages
        ? (input.endPage ?? book.effectivePages)
        : input.endPage;
    if (endPage != null && s.startPage != null && endPage < s.startPage) {
      throw badRequest('End page must be the same as or after the start page', [
        { path: 'endPage', message: `You started on page ${s.startPage}` },
      ]);
    }
    assertPageWithinBook(endPage, book.effectivePages, 'endPage');

    const { durationSeconds, capped } = accrue(s, now, settings.maxSessionMinutes * 60);
    const updated = await tx.readingSession.updateMany({
      where: { id, status: s.status, lastResumedAt: s.lastResumedAt },
      data: {
        status: 'COMPLETED',
        endedAt: now,
        lastResumedAt: null,
        durationSeconds,
        durationCapped: s.durationCapped || capped,
        endPage: endPage ?? null,
        note: input.note === undefined ? undefined : input.note,
      },
    });
    if (updated.count === 0) throw invalidTransition('COMPLETED', 'finish');

    const bookData: Prisma.StudentBookUpdateInput = { lastReadAt: now };
    if (endPage != null) bookData.currentPage = endPage;
    if (input.markBookCompleted) {
      bookData.status = 'COMPLETED';
      bookData.completedAt = now;
      if (book.effectivePages) bookData.currentPage = book.effectivePages;
    } else if (book.status !== 'READING') {
      bookData.status = 'READING';
    }
    await tx.studentBook.update({ where: { id: book.id }, data: bookData });

    return toSessionDto(await ownSession(tx, actor, id), now);
  });
}

export async function cancelSession(app: FastifyInstance, actor: AuthContext, id: string) {
  const now = app.now();
  return app.prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, actor, id);
    if (!nextTimerState(s.status, 'cancel')) throw invalidTransition(s.status, 'cancel');
    const updated = await tx.readingSession.updateMany({
      where: { id, status: s.status },
      data: { status: 'CANCELLED', endedAt: now, lastResumedAt: null },
    });
    if (updated.count === 0) throw invalidTransition('CANCELLED', 'cancel');
    return toSessionDto(await ownSession(tx, actor, id), now);
  });
}

// ---------------------------------------------------------------------------
// Manual entry and edits
// ---------------------------------------------------------------------------

/** Sessions of the student whose wall-clock span overlaps [start, end). */
async function findOverlaps(
  tx: Tx,
  studentId: string,
  start: Date,
  end: Date,
  now: Date,
  excludeId?: string,
) {
  const rows = await tx.$queryRaw<{ id: string; started_at: Date; ended_at: Date | null }[]>`
    SELECT id, started_at, ended_at FROM reading_sessions
    WHERE student_id = ${studentId}::uuid
      AND status <> 'CANCELLED'
      AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
      AND started_at < ${end}
      AND COALESCE(ended_at, ${now}) > ${start}
    ORDER BY started_at
    LIMIT 5`;
  return rows.map((r) => ({ id: r.id, startedAt: r.started_at, endedAt: r.ended_at }));
}

async function validateManualTimes(
  app: FastifyInstance,
  tx: Tx,
  studentId: string,
  startedAt: Date,
  endedAt: Date,
  excludeId?: string,
) {
  const settings = await getSettings(app.prisma);
  const now = app.now();
  if (endedAt <= startedAt) {
    throw badRequest('End time must be after the start time', [
      { path: 'endedAt', message: 'End time must be after the start time' },
    ]);
  }
  if (endedAt.getTime() > now.getTime() + 60_000) {
    throw badRequest('Sessions cannot end in the future', [
      { path: 'endedAt', message: 'This time is in the future' },
    ]);
  }
  const today = toLocalDate(now, settings.timeZone);
  const earliest = addDays(today, -settings.manualEntryMaxDays);
  const readingDate = toLocalDate(startedAt, settings.timeZone);
  if (readingDate < earliest) {
    throw badRequest(
      `Manual sessions can be added for the last ${settings.manualEntryMaxDays} days only`,
      [{ path: 'startedAt', message: `Choose a date on or after ${earliest}` }],
    );
  }
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  if (durationSeconds > settings.maxSessionMinutes * 60) {
    throw badRequest(`A session can be at most ${settings.maxSessionMinutes} minutes`, [
      { path: 'endedAt', message: `At most ${settings.maxSessionMinutes} minutes per session` },
    ]);
  }
  const overlaps = await findOverlaps(tx, studentId, startedAt, endedAt, now, excludeId);
  if (overlaps.length > 0) {
    throw conflict(
      'SESSION_OVERLAP',
      'This time overlaps another reading session. Adjust the times so reading is not counted twice.',
      { overlaps },
    );
  }
  return { durationSeconds, readingDate };
}

export async function createManualSession(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  input: ManualSessionInput,
) {
  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);
  return app.prisma.$transaction(async (tx) => {
    const book = await ownBook(tx, actor, input.studentBookId);
    if (book.archivedAt) throw badRequest('Restore this book before adding sessions');
    assertPageWithinBook(input.startPage, book.effectivePages, 'startPage');
    assertPageWithinBook(input.endPage, book.effectivePages, 'endPage');
    // Serialize manual entries per student so concurrent submissions cannot both pass the
    // overlap check.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.userId}))`;
    const { durationSeconds, readingDate } = await validateManualTimes(
      app,
      tx,
      actor.userId,
      startedAt,
      endedAt,
    );

    const created = await tx.readingSession.create({
      data: {
        studentId: actor.userId,
        studentBookId: book.id,
        source: 'MANUAL',
        status: 'COMPLETED',
        startedAt,
        endedAt,
        durationSeconds,
        readingDate: asDateColumn(readingDate),
        startPage: input.startPage ?? null,
        endPage: input.endPage ?? null,
        note: input.note ?? null,
      },
      select: sessionSelect,
    });

    // Back-dated entries never move progress backwards.
    const bookData: Prisma.StudentBookUpdateInput = {};
    if (!book.lastReadAt || endedAt > book.lastReadAt) bookData.lastReadAt = endedAt;
    if (input.endPage != null && input.endPage > book.currentPage)
      bookData.currentPage = input.endPage;
    if (book.status === 'PLANNED' || book.status === 'PAUSED') {
      bookData.status = 'READING';
      bookData.startedAt = book.startedAt ?? startedAt;
    }
    if (Object.keys(bookData).length > 0) {
      await tx.studentBook.update({ where: { id: book.id }, data: bookData });
    }
    await audit(tx, request, {
      action: 'session.manual_created',
      entityType: 'reading_session',
      entityId: created.id,
      metadata: { durationSeconds, readingDate },
    });
    return toSessionDto(created, app.now());
  });
}

export async function updateSession(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  id: string,
  input: UpdateSessionInput,
) {
  const settings = await getSettings(app.prisma);
  return app.prisma.$transaction(async (tx) => {
    const s = await ownSession(tx, actor, id);
    if (s.status === 'CANCELLED')
      throw conflict('SESSION_CANCELLED', 'Discarded sessions cannot be edited');
    const changesTime = input.startedAt !== undefined || input.endedAt !== undefined;
    if (changesTime && s.source !== 'MANUAL') {
      throw badRequest('Times of timed sessions are recorded automatically and cannot be changed');
    }
    const totalPages = s.studentBook.totalPages ?? s.studentBook.libraryBook.totalPages;
    const startPage = input.startPage === undefined ? s.startPage : input.startPage;
    const endPage = input.endPage === undefined ? s.endPage : input.endPage;
    if (startPage != null && endPage != null && endPage < startPage) {
      throw badRequest('End page must be the same as or after the start page', [
        { path: 'endPage', message: 'End page must be the same as or after the start page' },
      ]);
    }
    assertPageWithinBook(startPage, totalPages, 'startPage');
    assertPageWithinBook(endPage, totalPages, 'endPage');

    const data: Prisma.ReadingSessionUpdateInput = { startPage, endPage, note: input.note };
    const before = {
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
      startPage: s.startPage,
      endPage: s.endPage,
    };
    if (changesTime) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.userId}))`;
      const startedAt = new Date(input.startedAt ?? s.startedAt);
      const endedAt = new Date(input.endedAt ?? s.endedAt!);
      const { durationSeconds, readingDate } = await validateManualTimes(
        app,
        tx,
        actor.userId,
        startedAt,
        endedAt,
        id,
      );
      Object.assign(data, {
        startedAt,
        endedAt,
        durationSeconds,
        readingDate: asDateColumn(readingDate),
      });
    }
    const row = await tx.readingSession.update({ where: { id }, data, select: sessionSelect });
    await audit(tx, request, {
      action: 'session.edited',
      entityType: 'reading_session',
      entityId: id,
      metadata: {
        source: s.source,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(
          JSON.stringify({
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            durationSeconds: row.durationSeconds,
            startPage: row.startPage,
            endPage: row.endPage,
          }),
        ),
        noteChanged: input.note !== undefined,
        timeZone: settings.timeZone,
      },
    });
    return toSessionDto(row, app.now());
  });
}

// ---------------------------------------------------------------------------
// Administrative correction
// ---------------------------------------------------------------------------

/**
 * Administrators may void a session that should not count (recorded by mistake, not genuine).
 * This is the only way anyone other than the student changes reading data. The session is kept
 * with status CANCELLED (excluded from every metric) and the reason is written to the audit log.
 */
export async function voidSession(
  app: FastifyInstance,
  request: FastifyRequest,
  id: string,
  reason: string,
) {
  const now = app.now();
  return app.prisma.$transaction(async (tx) => {
    const s = await tx.readingSession.findUnique({ where: { id }, select: sessionSelect });
    if (!s) throw notFound('Reading session');
    if (s.status === 'CANCELLED') {
      throw conflict('INVALID_TRANSITION', 'This session is already discarded');
    }
    const updated = await tx.readingSession.updateMany({
      where: { id, status: s.status },
      data: { status: 'CANCELLED', endedAt: s.endedAt ?? now, lastResumedAt: null },
    });
    if (updated.count === 0) throw invalidTransition(s.status, 'cancel');
    await audit(tx, request, {
      action: 'session.voided',
      entityType: 'reading_session',
      entityId: id,
      metadata: {
        reason,
        studentId: s.studentId,
        previousStatus: s.status,
        source: s.source,
        durationSeconds: s.durationSeconds,
        readingDate: s.readingDate.toISOString().slice(0, 10),
      },
    });
    const row = await tx.readingSession.findUniqueOrThrow({ where: { id }, select: sessionSelect });
    return toSessionDto(row, now);
  });
}

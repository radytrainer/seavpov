import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  READING_STATUSES,
  progressPercent,
  type ReadingStatus,
  type StudentBookCreateInput,
  type StudentBookUpdateInput,
} from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { visibleStudentFilter } from '../../lib/access';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';
import {
  catalogVisibility,
  createLibraryBook,
  libraryBookDto,
  libraryBookSelect,
} from '../library-books/service';

export const studentBookSelect = {
  id: true,
  studentId: true,
  status: true,
  currentPage: true,
  totalPages: true,
  notes: true,
  startedAt: true,
  completedAt: true,
  lastReadAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  libraryBook: { select: libraryBookSelect },
} satisfies Prisma.StudentBookSelect;

type StudentBookRecord = Prisma.StudentBookGetPayload<{ select: typeof studentBookSelect }>;

export const studentBookDto = z.object({
  id: z.string(),
  studentId: z.string(),
  status: z.enum(READING_STATUSES),
  currentPage: z.number(),
  /** Effective page count: the student's override, else the catalog value. */
  totalPages: z.number().nullable(),
  progressPercent: z.number().nullable(),
  notes: z.string().nullable(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  lastReadAt: z.date().nullable(),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  book: libraryBookDto,
});
export type StudentBookDto = z.infer<typeof studentBookDto>;

export function toStudentBookDto(r: StudentBookRecord): StudentBookDto {
  const { libraryBook, totalPages, ...rest } = r;
  const effective = totalPages ?? libraryBook.totalPages;
  return {
    ...rest,
    totalPages: effective,
    progressPercent: progressPercent(r.currentPage, effective),
    book: libraryBook,
  };
}

export interface ListStudentBooksQuery {
  page: number;
  pageSize: number;
  status?: ReadingStatus;
  categoryId?: string;
  search?: string;
  sort: 'recent' | 'title' | 'started';
  archived: boolean;
  studentId?: string;
}

const ORDER: Record<ListStudentBooksQuery['sort'], Prisma.StudentBookOrderByWithRelationInput[]> = {
  recent: [{ lastReadAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
  title: [{ libraryBook: { title: 'asc' } }],
  started: [{ startedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
};

export async function listStudentBooks(
  app: FastifyInstance,
  actor: AuthContext,
  query: ListStudentBooksQuery,
) {
  const q = query.search?.trim();
  const where: Prisma.StudentBookWhereInput = {
    AND: [
      visibleStudentFilter(actor),
      query.studentId ? { studentId: query.studentId } : {},
      { archivedAt: query.archived ? { not: null } : null },
      query.status ? { status: query.status } : {},
      query.categoryId ? { libraryBook: { categoryId: query.categoryId } } : {},
      q
        ? {
            libraryBook: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { author: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {},
    ],
  };
  const [rows, total] = await app.prisma.$transaction([
    app.prisma.studentBook.findMany({
      where,
      select: studentBookSelect,
      orderBy: [...ORDER[query.sort], { id: 'asc' }],
      ...pageArgs(query),
    }),
    app.prisma.studentBook.count({ where }),
  ]);
  return { items: rows.map(toStudentBookDto), total };
}

/** Loads a student book the actor may view (owner, assigned trainer, admin) or 404. */
export async function getVisibleStudentBook(app: FastifyInstance, actor: AuthContext, id: string) {
  const row = await app.prisma.studentBook.findFirst({
    where: { AND: [{ id }, visibleStudentFilter(actor)] },
    select: studentBookSelect,
  });
  if (!row) throw notFound('Book');
  return row;
}

/** Loads a student book owned by the acting student or 404 (used for every mutation). */
async function getOwnStudentBook(app: FastifyInstance, actor: AuthContext, id: string) {
  const row = await app.prisma.studentBook.findFirst({
    where: { id, studentId: actor.userId },
    select: studentBookSelect,
  });
  if (!row) throw notFound('Book');
  return row;
}

export async function getStudentBookDetail(app: FastifyInstance, actor: AuthContext, id: string) {
  const row = await getVisibleStudentBook(app, actor, id);
  const [stats, active] = await Promise.all([
    app.prisma.readingSession.aggregate({
      where: { studentBookId: id, status: 'COMPLETED' },
      _count: { _all: true },
      _sum: { durationSeconds: true },
    }),
    app.prisma.readingSession.findFirst({
      where: { studentBookId: id, status: { in: ['READING', 'PAUSED'] } },
      select: { id: true },
    }),
  ]);
  return {
    ...toStudentBookDto(row),
    stats: {
      sessionCount: stats._count._all,
      totalSeconds: stats._sum.durationSeconds ?? 0,
    },
    activeSessionId: active?.id ?? null,
  };
}

export async function createStudentBook(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  input: StudentBookCreateInput,
) {
  return app.prisma.$transaction(async (tx) => {
    let libraryBookId = input.libraryBookId;
    if (libraryBookId) {
      const visible = await tx.libraryBook.findFirst({
        where: { AND: [{ id: libraryBookId }, catalogVisibility(actor), { archivedAt: null }] },
        select: { id: true },
      });
      if (!visible) throw notFound('Book');
    } else {
      libraryBookId = (await createLibraryBook(tx, request, actor, input.newBook!)).id;
    }

    const existing = await tx.studentBook.findUnique({
      where: { studentId_libraryBookId: { studentId: actor.userId, libraryBookId } },
      select: { id: true, archivedAt: true },
    });
    if (existing) {
      throw conflict(
        'ALREADY_TRACKING',
        existing.archivedAt
          ? 'This book is in your archived books. Restore it instead of adding it again.'
          : 'This book is already in My Books.',
        { studentBookId: existing.id },
      );
    }

    const now = new Date();
    const row = await tx.studentBook.create({
      data: {
        studentId: actor.userId,
        libraryBookId,
        status: input.status,
        notes: input.notes ?? null,
        startedAt: input.status === 'READING' ? now : null,
      },
      select: studentBookSelect,
    });
    return toStudentBookDto(row);
  });
}

export async function updateStudentBook(
  app: FastifyInstance,
  actor: AuthContext,
  id: string,
  input: StudentBookUpdateInput,
) {
  const current = await getOwnStudentBook(app, actor, id);
  const totalPages =
    input.totalPages === undefined
      ? (current.totalPages ?? current.libraryBook.totalPages)
      : (input.totalPages ?? current.libraryBook.totalPages);
  const currentPage = input.currentPage ?? current.currentPage;
  if (totalPages && currentPage > totalPages) {
    throw badRequest('Current page is beyond the last page', [
      { path: 'currentPage', message: `This book has ${totalPages} pages` },
    ]);
  }
  const { archived, ...fields } = input;
  const row = await app.prisma.studentBook.update({
    where: { id },
    data: {
      ...fields,
      archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
    },
    select: studentBookSelect,
  });
  return toStudentBookDto(row);
}

export async function updateStudentBookStatus(
  app: FastifyInstance,
  actor: AuthContext,
  id: string,
  status: ReadingStatus,
) {
  const current = await getOwnStudentBook(app, actor, id);
  if (status === current.status) return toStudentBookDto(current);
  if (['COMPLETED', 'ABANDONED', 'PLANNED'].includes(status)) {
    const active = await app.prisma.readingSession.count({
      where: { studentBookId: id, status: { in: ['READING', 'PAUSED'] } },
    });
    if (active > 0) {
      throw conflict('ACTIVE_SESSION', 'Finish or discard the active reading session first.');
    }
  }
  const now = new Date();
  const totalPages = current.totalPages ?? current.libraryBook.totalPages;
  const data: Prisma.StudentBookUpdateInput = { status };
  if (status === 'COMPLETED') {
    data.completedAt = now;
    data.startedAt = current.startedAt ?? now;
    if (totalPages) data.currentPage = totalPages;
  } else {
    data.completedAt = null;
    if (status === 'READING') data.startedAt = current.startedAt ?? now;
  }
  const row = await app.prisma.studentBook.update({
    where: { id },
    data,
    select: studentBookSelect,
  });
  return toStudentBookDto(row);
}

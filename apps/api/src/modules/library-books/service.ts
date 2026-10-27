import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CATALOG_STATUSES, normalizedBookKey, type LibraryBookInput } from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';

type Db = FastifyInstance['prisma'] | Prisma.TransactionClient;

export const libraryBookSelect = {
  id: true,
  title: true,
  author: true,
  isbn: true,
  libraryCode: true,
  totalPages: true,
  coverImageUrl: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true } },
} satisfies Prisma.LibraryBookSelect;

export const libraryBookDto = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  isbn: z.string().nullable(),
  libraryCode: z.string().nullable(),
  totalPages: z.number().nullable(),
  coverImageUrl: z.string().nullable(),
  status: z.enum(CATALOG_STATUSES),
  archivedAt: z.date().nullable(),
  createdAt: z.date(),
  category: z.object({ id: z.string(), name: z.string() }).nullable(),
});

/**
 * Catalog visibility: approved, non-archived books for everyone; students also see the pending
 * entries they submitted themselves; admins see everything.
 */
export function catalogVisibility(actor: AuthContext): Prisma.LibraryBookWhereInput {
  if (actor.role === 'ADMIN') return {};
  return {
    archivedAt: null,
    OR: [{ status: 'APPROVED' }, { status: 'PENDING', createdById: actor.userId }],
  };
}

export interface ListLibraryBooksQuery {
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  status?: 'APPROVED' | 'PENDING';
}

export async function listLibraryBooks(
  app: FastifyInstance,
  actor: AuthContext,
  query: ListLibraryBooksQuery,
) {
  const q = query.search?.trim();
  const where: Prisma.LibraryBookWhereInput = {
    AND: [
      catalogVisibility(actor),
      query.categoryId ? { categoryId: query.categoryId } : {},
      query.status && actor.role === 'ADMIN' ? { status: query.status } : {},
      q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { author: { contains: q, mode: 'insensitive' } },
              { isbn: { contains: q.replace(/[\s-]/g, '').toUpperCase() } },
              { libraryCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {},
    ],
  };
  const [items, total] = await app.prisma.$transaction([
    app.prisma.libraryBook.findMany({
      where,
      select: libraryBookSelect,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      ...pageArgs(query),
    }),
    app.prisma.libraryBook.count({ where }),
  ]);
  return { items, total };
}

export async function getLibraryBook(app: FastifyInstance, actor: AuthContext, id: string) {
  const book = await app.prisma.libraryBook.findFirst({
    where: { AND: [{ id }, catalogVisibility(actor)] },
    select: libraryBookSelect,
  });
  if (!book) throw notFound('Book');
  return book;
}

/** Throws 409 DUPLICATE_BOOK (with the existing entry) when the book is already catalogued. */
async function assertNotDuplicate(
  db: Db,
  input: {
    title?: string;
    author?: string | null;
    isbn?: string | null;
    libraryCode?: string | null;
  },
  actor: AuthContext,
  excludeId?: string,
) {
  const or: Prisma.LibraryBookWhereInput[] = [];
  if (input.isbn) or.push({ isbn: input.isbn });
  if (input.libraryCode) or.push({ libraryCode: input.libraryCode });
  if (input.title) or.push({ normalizedKey: normalizedBookKey(input.title, input.author) });
  if (or.length === 0) return;
  const existing = await db.libraryBook.findFirst({
    where: { OR: or, id: excludeId ? { not: excludeId } : undefined, archivedAt: null },
    select: { ...libraryBookSelect, createdById: true },
  });
  if (!existing) return;
  // Do not reveal another student's pending submission.
  const visible =
    actor.role === 'ADMIN' ||
    existing.status === 'APPROVED' ||
    existing.createdById === actor.userId;
  const { createdById: _ignored, ...book } = existing;
  throw conflict(
    'DUPLICATE_BOOK',
    visible
      ? 'This book is already in the catalog. Select the existing entry instead.'
      : 'A matching book is awaiting approval. Please ask your librarian or administrator.',
    visible ? { existing: book } : undefined,
  );
}

async function assertCategory(db: Db, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const found = await db.bookCategory.findFirst({ where: { id: categoryId, archivedAt: null } });
  if (!found)
    throw badRequest('Category not found', [{ path: 'categoryId', message: 'Category not found' }]);
}

export async function createLibraryBook(
  db: Db,
  request: FastifyRequest,
  actor: AuthContext,
  input: LibraryBookInput,
) {
  await assertNotDuplicate(db, input, actor);
  await assertCategory(db, input.categoryId);
  const book = await db.libraryBook.create({
    data: {
      title: input.title,
      author: input.author ?? null,
      normalizedKey: normalizedBookKey(input.title, input.author),
      categoryId: input.categoryId ?? null,
      isbn: input.isbn ?? null,
      libraryCode: input.libraryCode ?? null,
      totalPages: input.totalPages ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      status: actor.role === 'ADMIN' ? 'APPROVED' : 'PENDING',
      createdById: actor.userId,
    },
    select: libraryBookSelect,
  });
  await audit(db, request, {
    action: 'library_book.created',
    entityType: 'library_book',
    entityId: book.id,
    metadata: { status: book.status },
  });
  return book;
}

export async function updateLibraryBook(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  id: string,
  input: Partial<LibraryBookInput> & { status?: 'APPROVED' | 'PENDING'; archived?: boolean },
) {
  const current = await app.prisma.libraryBook.findUnique({ where: { id } });
  if (!current) throw notFound('Book');
  const title = input.title ?? current.title;
  const author = input.author === undefined ? current.author : input.author;
  await assertNotDuplicate(
    app.prisma,
    {
      title: input.title !== undefined || input.author !== undefined ? title : undefined,
      author,
      isbn: input.isbn,
      libraryCode: input.libraryCode,
    },
    actor,
    id,
  );
  await assertCategory(app.prisma, input.categoryId);
  const { archived, ...fields } = input;
  const book = await app.prisma.libraryBook.update({
    where: { id },
    data: {
      ...fields,
      normalizedKey: normalizedBookKey(title, author),
      archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
    },
    select: libraryBookSelect,
  });
  await audit(app.prisma, request, {
    action:
      input.status === 'APPROVED' && current.status === 'PENDING'
        ? 'library_book.approved'
        : archived
          ? 'library_book.archived'
          : 'library_book.updated',
    entityType: 'library_book',
    entityId: id,
    metadata: { fields: Object.keys(input) },
  });
  return book;
}

/**
 * Merges a duplicate catalog entry into another: student records move to the target.
 * Fails if a student tracks both books (their records must be resolved first).
 */
export async function mergeLibraryBook(
  app: FastifyInstance,
  request: FastifyRequest,
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) throw badRequest('Choose a different book to merge into');
  return app.prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.libraryBook.findUnique({ where: { id: sourceId }, select: { id: true } }),
      tx.libraryBook.findUnique({ where: { id: targetId }, select: { id: true } }),
    ]);
    if (!source || !target) throw notFound('Book');
    const overlapping = await tx.studentBook.count({
      where: {
        libraryBookId: sourceId,
        student: { studentBooks: { some: { libraryBookId: targetId } } },
      },
    });
    if (overlapping > 0) {
      throw conflict(
        'MERGE_CONFLICT',
        `${overlapping} student(s) track both books. Resolve their records before merging.`,
      );
    }
    const moved = await tx.studentBook.updateMany({
      where: { libraryBookId: sourceId },
      data: { libraryBookId: targetId },
    });
    await tx.libraryBook.update({
      where: { id: sourceId },
      data: { archivedAt: new Date(), isbn: null, libraryCode: null },
    });
    await audit(tx, request, {
      action: 'library_book.merged',
      entityType: 'library_book',
      entityId: sourceId,
      metadata: { targetId, movedRecords: moved.count },
    });
    return { moved: moved.count };
  });
}

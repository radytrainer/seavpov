import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  REFLECTION_TEXT_FIELDS,
  type CreateReflectionInput,
  type UpdateReflectionInput,
} from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthContext } from '../../plugins/auth';
import { assertCanViewStudent, visibleStudentFilter } from '../../lib/access';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';

type Tx = Prisma.TransactionClient;

export const reflectionSelect = {
  id: true,
  sessionId: true,
  studentId: true,
  whatRead: true,
  learned: true,
  keyIdeas: true,
  application: true,
  keyTakeaway: true,
  understandingRating: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { name: true } } }, orderBy: { tag: { name: 'asc' } } },
  student: { select: { fullName: true } },
  session: {
    select: {
      readingDate: true,
      durationSeconds: true,
      startPage: true,
      endPage: true,
      source: true,
      studentBook: { select: { id: true, libraryBook: { select: { title: true, author: true } } } },
    },
  },
  feedback: {
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      trainer: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ReadingReflectionSelect;

type ReflectionRecord = Prisma.ReadingReflectionGetPayload<{ select: typeof reflectionSelect }>;

const feedbackDto = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  trainer: z.object({ id: z.string(), fullName: z.string() }),
});

export const reflectionDto = z.object({
  id: z.string(),
  sessionId: z.string(),
  studentId: z.string(),
  studentName: z.string(),
  whatRead: z.string().nullable(),
  learned: z.string().nullable(),
  keyIdeas: z.string().nullable(),
  application: z.string().nullable(),
  keyTakeaway: z.string().nullable(),
  understandingRating: z.number().nullable(),
  tags: z.array(z.string()),
  session: z.object({
    readingDate: z.string(),
    durationSeconds: z.number(),
    startPage: z.number().nullable(),
    endPage: z.number().nullable(),
    source: z.enum(['TIMER', 'MANUAL']),
  }),
  book: z.object({ studentBookId: z.string(), title: z.string(), author: z.string().nullable() }),
  feedback: z.array(feedbackDto),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ReflectionDto = z.infer<typeof reflectionDto>;

function toDto(r: ReflectionRecord): ReflectionDto {
  const { tags, student, session, feedback, ...rest } = r;
  return {
    ...rest,
    studentName: student.fullName,
    tags: tags.map((t) => t.tag.name),
    session: {
      readingDate: session.readingDate.toISOString().slice(0, 10),
      durationSeconds: session.durationSeconds,
      startPage: session.startPage,
      endPage: session.endPage,
      source: session.source,
    },
    book: {
      studentBookId: session.studentBook.id,
      title: session.studentBook.libraryBook.title,
      author: session.studentBook.libraryBook.author,
    },
    feedback,
  };
}

async function setTags(tx: Tx, reflectionId: string, tags: string[]) {
  await tx.reflectionTagAssignment.deleteMany({ where: { reflectionId } });
  if (tags.length === 0) return;
  await tx.reflectionTag.createMany({ data: tags.map((name) => ({ name })), skipDuplicates: true });
  const rows = await tx.reflectionTag.findMany({
    where: { name: { in: tags } },
    select: { id: true },
  });
  await tx.reflectionTagAssignment.createMany({
    data: rows.map((t) => ({ reflectionId, tagId: t.id })),
  });
}

export async function createReflection(
  app: FastifyInstance,
  actor: AuthContext,
  input: CreateReflectionInput,
) {
  const { sessionId, tags, ...fields } = input;
  return app.prisma.$transaction(async (tx) => {
    const session = await tx.readingSession.findFirst({
      where: { id: sessionId, studentId: actor.userId },
      select: { id: true, status: true, reflection: { select: { id: true } } },
    });
    if (!session) throw notFound('Reading session');
    if (session.status !== 'COMPLETED') {
      throw conflict('SESSION_NOT_COMPLETED', 'Finish the reading session before reflecting on it');
    }
    if (session.reflection) {
      throw conflict('REFLECTION_EXISTS', 'This session already has a reflection', {
        reflectionId: session.reflection.id,
      });
    }
    const created = await tx.readingReflection.create({
      data: { sessionId, studentId: actor.userId, ...fields },
      select: { id: true },
    });
    if (tags) await setTags(tx, created.id, tags);
    return toDto(
      await tx.readingReflection.findUniqueOrThrow({
        where: { id: created.id },
        select: reflectionSelect,
      }),
    );
  });
}

export async function updateReflection(
  app: FastifyInstance,
  actor: AuthContext,
  id: string,
  input: UpdateReflectionInput,
) {
  const { tags, ...fields } = input;
  return app.prisma.$transaction(async (tx) => {
    const current = await tx.readingReflection.findFirst({
      where: { id, studentId: actor.userId },
      select: reflectionSelect,
    });
    if (!current) throw notFound('Reflection');
    const merged = { ...current, ...fields };
    const empty =
      REFLECTION_TEXT_FIELDS.every((f) => !merged[f]) && merged.understandingRating == null;
    if (empty) {
      throw badRequest('Write at least one answer', [
        { path: 'whatRead', message: 'Write at least one answer' },
      ]);
    }
    await tx.readingReflection.update({ where: { id }, data: fields });
    if (tags) await setTags(tx, id, tags);
    return toDto(
      await tx.readingReflection.findUniqueOrThrow({ where: { id }, select: reflectionSelect }),
    );
  });
}

export async function getReflection(app: FastifyInstance, actor: AuthContext, id: string) {
  const row = await app.prisma.readingReflection.findFirst({
    where: { AND: [{ id }, visibleStudentFilter(actor)] },
    select: reflectionSelect,
  });
  if (!row) throw notFound('Reflection');
  return toDto(row);
}

export interface ListReflectionsQuery {
  page: number;
  pageSize: number;
  search?: string;
  studentBookId?: string;
  studentId?: string;
  classId?: string;
  tag?: string;
  from?: string;
  to?: string;
  /** Trainer review queue: reflections without any feedback yet. */
  needsFeedback?: boolean;
}

export async function listReflections(
  app: FastifyInstance,
  actor: AuthContext,
  q: ListReflectionsQuery,
) {
  const search = q.search?.trim();
  const dateFilter =
    q.from || q.to
      ? {
          readingDate: {
            gte: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
            lte: q.to ? new Date(`${q.to}T00:00:00Z`) : undefined,
          },
        }
      : {};
  const where: Prisma.ReadingReflectionWhereInput = {
    AND: [
      visibleStudentFilter(actor),
      q.studentId ? { studentId: q.studentId } : {},
      q.classId ? { student: { classId: q.classId } } : {},
      q.studentBookId || q.from || q.to
        ? {
            session: {
              ...(q.studentBookId ? { studentBookId: q.studentBookId } : {}),
              ...dateFilter,
            },
          }
        : {},
      q.tag ? { tags: { some: { tag: { name: q.tag.toLowerCase() } } } } : {},
      q.needsFeedback ? { feedback: { none: {} } } : {},
      search
        ? {
            OR: [
              ...REFLECTION_TEXT_FIELDS.map((f) => ({
                [f]: { contains: search, mode: 'insensitive' as const },
              })),
              { session: { note: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {},
    ],
  };
  const [rows, total] = await app.prisma.$transaction([
    app.prisma.readingReflection.findMany({
      where,
      select: reflectionSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(q),
    }),
    app.prisma.readingReflection.count({ where }),
  ]);
  return { items: rows.map(toDto), total };
}

// ---------------------------------------------------------------------------
// Trainer feedback
// ---------------------------------------------------------------------------

export async function addFeedback(
  app: FastifyInstance,
  request: FastifyRequest,
  actor: AuthContext,
  reflectionId: string,
  body: string,
) {
  if (actor.role === 'STUDENT') throw forbidden();
  const reflection = await app.prisma.readingReflection.findUnique({
    where: { id: reflectionId },
    select: { studentId: true },
  });
  if (!reflection) throw notFound('Reflection');
  await assertCanViewStudent(app.prisma, actor, reflection.studentId, 'Reflection');
  const feedback = await app.prisma.trainerFeedback.create({
    data: { reflectionId, trainerId: actor.userId, body },
    select: { id: true },
  });
  await audit(app.prisma, request, {
    action: 'feedback.created',
    entityType: 'reflection',
    entityId: reflectionId,
    metadata: { feedbackId: feedback.id },
  });
  return getReflection(app, actor, reflectionId);
}

export async function updateFeedback(
  app: FastifyInstance,
  actor: AuthContext,
  reflectionId: string,
  feedbackId: string,
  body: string,
) {
  const updated = await app.prisma.trainerFeedback.updateMany({
    where: { id: feedbackId, reflectionId, trainerId: actor.userId },
    data: { body },
  });
  if (updated.count === 0) throw notFound('Feedback');
  return getReflection(app, actor, reflectionId);
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AdminCreateUserInput, AdminUpdateUserInput, Role, UserStatus } from '@rt/shared';
import type { Prisma } from '../../generated/prisma/client';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { pageArgs } from '../../lib/pagination';
import { generateTemporaryPassword, hashPassword } from '../../lib/security';
import { userSelect } from './dto';

export interface ListUsersQuery {
  page: number;
  pageSize: number;
  role?: Role;
  status?: UserStatus;
  classId?: string;
  generationId?: string;
  search?: string;
  /** Students without any trainer assignment. */
  unassigned?: boolean;
}

export function userSearchFilter(search?: string): Prisma.UserWhereInput {
  if (!search) return {};
  const q = search.trim();
  return {
    OR: [
      { fullName: { contains: q, mode: 'insensitive' } },
      { username: { contains: q.toLowerCase() } },
      { studentCode: { contains: q.toUpperCase() } },
      { email: { contains: q.toLowerCase() } },
    ],
  };
}

export async function listUsers(app: FastifyInstance, query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    role: query.role,
    status: query.status,
    classId: query.classId,
    class: query.generationId ? { generationId: query.generationId } : undefined,
    ...(query.unassigned ? { role: 'STUDENT', studentAssignments: { none: {} } } : {}),
    ...userSearchFilter(query.search),
  };
  const [items, total] = await app.prisma.$transaction([
    app.prisma.user.findMany({
      where,
      select: { ...userSelect, _count: { select: { trainerAssignments: true } } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      ...pageArgs(query),
    }),
    app.prisma.user.count({ where }),
  ]);
  return {
    items: items.map(({ _count, ...u }) => ({ ...u, assignedStudents: _count.trainerAssignments })),
    total,
  };
}

export async function assertUnique(
  app: FastifyInstance,
  values: { username?: string; email?: string | null; studentCode?: string | null },
  excludeId?: string,
) {
  const or: Prisma.UserWhereInput[] = [];
  if (values.username) or.push({ username: values.username });
  if (values.email) or.push({ email: values.email });
  if (values.studentCode) or.push({ studentCode: values.studentCode });
  if (or.length === 0) return;
  const existing = await app.prisma.user.findFirst({
    where: { OR: or, id: excludeId ? { not: excludeId } : undefined },
    select: { username: true, email: true, studentCode: true },
  });
  if (!existing) return;
  const fields: string[] = [];
  if (values.username && existing.username === values.username) fields.push('username');
  if (values.email && existing.email === values.email) fields.push('email');
  if (values.studentCode && existing.studentCode === values.studentCode) fields.push('studentCode');
  throw conflict(
    'DUPLICATE_USER',
    `Another account already uses this ${fields.join(', ')}`,
    fields.map((f) => ({ path: f, message: 'Already in use' })),
  );
}

async function assertClassExists(app: FastifyInstance, classId: string | null | undefined) {
  if (!classId) return;
  const found = await app.prisma.class.findFirst({
    where: { id: classId, archivedAt: null },
    select: { id: true },
  });
  if (!found)
    throw badRequest('Class not found', [{ path: 'classId', message: 'Class not found' }]);
}

export async function createUser(
  app: FastifyInstance,
  request: FastifyRequest,
  input: AdminCreateUserInput,
) {
  await assertUnique(app, input);
  await assertClassExists(app, input.classId);
  const temporaryPassword = input.password ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(input.password ?? temporaryPassword!);

  const user = await app.prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: input.role,
        username: input.username,
        fullName: input.fullName,
        email: input.email ?? null,
        studentCode: input.role === 'STUDENT' ? (input.studentCode ?? null) : null,
        gender: input.gender ?? null,
        classId: input.role === 'STUDENT' ? (input.classId ?? null) : null,
        passwordHash,
        mustChangePassword: true,
      },
      select: userSelect,
    });
    await audit(tx, request, {
      action: 'user.created',
      entityType: 'user',
      entityId: created.id,
      metadata: { role: created.role, username: created.username },
    });
    return created;
  });
  return { user, temporaryPassword };
}

export async function updateUser(
  app: FastifyInstance,
  request: FastifyRequest,
  id: string,
  input: AdminUpdateUserInput,
) {
  const actorId = request.auth!.userId;
  const current = await app.prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  if (!current) throw notFound('User');
  if (id === actorId && input.status === 'INACTIVE') {
    throw badRequest('You cannot deactivate your own account');
  }
  if (id === actorId && input.role && input.role !== 'ADMIN') {
    throw badRequest('You cannot remove your own administrator role');
  }
  await assertUnique(app, input, id);
  await assertClassExists(app, input.classId);

  const role = input.role ?? current.role;
  const data: Prisma.UserUpdateInput = {
    role: input.role,
    status: input.status,
    username: input.username,
    fullName: input.fullName,
    email: input.email,
    gender: input.gender,
    studentCode: role === 'STUDENT' ? input.studentCode : null,
    class:
      role !== 'STUDENT'
        ? { disconnect: true }
        : input.classId === undefined
          ? undefined
          : input.classId === null
            ? { disconnect: true }
            : { connect: { id: input.classId } },
  };

  return app.prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data, select: userSelect });
    if (input.status === 'INACTIVE' || (input.role && input.role !== current.role)) {
      // Deactivation and role changes take effect immediately.
      await tx.authSession.deleteMany({ where: { userId: id } });
    }
    if (input.role && input.role !== current.role) {
      await tx.trainerStudentAssignment.deleteMany({
        where: current.role === 'TRAINER' ? { trainerId: id } : { studentId: id },
      });
    }
    await audit(tx, request, {
      action:
        input.status && input.status !== current.status
          ? input.status === 'ACTIVE'
            ? 'user.activated'
            : 'user.deactivated'
          : 'user.updated',
      entityType: 'user',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  });
}

export async function resetUserPassword(app: FastifyInstance, request: FastifyRequest, id: string) {
  const exists = await app.prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw notFound('User');
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await app.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.authSession.deleteMany({ where: { userId: id } });
    await audit(tx, request, { action: 'user.password_reset', entityType: 'user', entityId: id });
  });
  return { temporaryPassword };
}

// ---------------------------------------------------------------------------
// Trainer ↔ student assignments
// ---------------------------------------------------------------------------

async function assertRole(app: FastifyInstance, id: string, role: Role) {
  const user = await app.prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!user || user.role !== role) throw notFound(role === 'TRAINER' ? 'Trainer' : 'Student');
}

export async function listTrainerStudents(app: FastifyInstance, trainerId: string) {
  await assertRole(app, trainerId, 'TRAINER');
  const rows = await app.prisma.trainerStudentAssignment.findMany({
    where: { trainerId },
    select: { student: { select: userSelect } },
    orderBy: { student: { fullName: 'asc' } },
  });
  return rows.map((r) => r.student);
}

/** Adds students (explicit IDs and/or every active student in a class) to a trainer. */
export async function assignStudents(
  app: FastifyInstance,
  request: FastifyRequest,
  trainerId: string,
  input: { studentIds?: string[]; classId?: string },
) {
  await assertRole(app, trainerId, 'TRAINER');
  const ids = new Set(input.studentIds ?? []);
  if (input.classId) {
    const students = await app.prisma.user.findMany({
      where: { classId: input.classId, role: 'STUDENT', status: 'ACTIVE' },
      select: { id: true },
    });
    students.forEach((s) => ids.add(s.id));
  }
  const valid = await app.prisma.user.findMany({
    where: { id: { in: [...ids] }, role: 'STUDENT' },
    select: { id: true },
  });
  if (valid.length !== ids.size) {
    throw badRequest('Some selected users are not students');
  }
  const result = await app.prisma.$transaction(async (tx) => {
    const created = await tx.trainerStudentAssignment.createMany({
      data: valid.map((s) => ({ trainerId, studentId: s.id })),
      skipDuplicates: true,
    });
    await audit(tx, request, {
      action: 'assignment.added',
      entityType: 'trainer',
      entityId: trainerId,
      metadata: { added: created.count, classId: input.classId ?? null },
    });
    return created.count;
  });
  return { added: result };
}

export async function unassignStudent(
  app: FastifyInstance,
  request: FastifyRequest,
  trainerId: string,
  studentId: string,
) {
  const deleted = await app.prisma.trainerStudentAssignment.deleteMany({
    where: { trainerId, studentId },
  });
  if (deleted.count === 0) throw notFound('Assignment');
  await audit(app.prisma, request, {
    action: 'assignment.removed',
    entityType: 'trainer',
    entityId: trainerId,
    metadata: { studentId },
  });
}

import type { PrismaClient } from '../generated/prisma/client';
import type { AuthContext } from '../plugins/auth';
import { notFound } from './errors';

/**
 * Object-level authorization for student-owned data.
 * - Students: only themselves.
 * - Trainers: only students assigned to them.
 * - Admins: everyone.
 * Unauthorized access returns 404 so record existence is not revealed.
 */
export async function canViewStudent(
  prisma: PrismaClient,
  actor: AuthContext,
  studentId: string,
): Promise<boolean> {
  if (actor.role === 'ADMIN') return true;
  if (actor.role === 'STUDENT') return actor.userId === studentId;
  const assignment = await prisma.trainerStudentAssignment.findUnique({
    where: { trainerId_studentId: { trainerId: actor.userId, studentId } },
    select: { id: true },
  });
  return assignment !== null;
}

export async function assertCanViewStudent(
  prisma: PrismaClient,
  actor: AuthContext,
  studentId: string,
  what = 'Student',
): Promise<void> {
  if (!(await canViewStudent(prisma, actor, studentId))) throw notFound(what);
}

/** Prisma `where` fragment restricting student-owned rows to what the actor may see. */
export function visibleStudentFilter(actor: AuthContext) {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'STUDENT') return { studentId: actor.userId };
  return { student: { studentAssignments: { some: { trainerId: actor.userId } } } };
}

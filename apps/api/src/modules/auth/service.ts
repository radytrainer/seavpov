import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError, badRequest } from '../../lib/errors';
import { audit } from '../../lib/audit';
import {
  generateToken,
  hashPassword,
  sha256,
  verifyDummyPassword,
  verifyPassword,
} from '../../lib/security';
import type { RegisterInput } from '@rt/shared';
import { getSettings } from '../../lib/settings';
import { userSelect, type UserRecord } from '../users/dto';
import { assertUnique } from '../users/service';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const RESET_TOKEN_MINUTES = 30;

/** One message for every login failure, so responses do not reveal which accounts exist. */
const LOGIN_FAILED = new AppError(
  401,
  'INVALID_CREDENTIALS',
  `Sign-in failed. Check your details, or wait ${LOCKOUT_MINUTES} minutes after repeated attempts.`,
);

export function normalizeIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  return { lower: trimmed.toLowerCase(), upper: trimmed.toUpperCase() };
}

export async function login(
  app: FastifyInstance,
  request: FastifyRequest,
  identifier: string,
  password: string,
): Promise<{ token: string; user: UserRecord }> {
  const { lower, upper } = normalizeIdentifier(identifier);
  const user = await app.prisma.user.findFirst({
    where: { OR: [{ username: lower }, { email: lower }, { studentCode: upper }] },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      lockedUntil: true,
      failedLoginCount: true,
    },
  });

  if (!user) {
    await verifyDummyPassword(password);
    throw LOGIN_FAILED;
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    await verifyDummyPassword(password);
    throw LOGIN_FAILED;
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await app.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
      },
    });
    if (lock) {
      await audit(
        app.prisma,
        request,
        { action: 'auth.locked', entityType: 'user', entityId: user.id },
        null,
      );
    }
    throw LOGIN_FAILED;
  }

  if (user.status !== 'ACTIVE') throw LOGIN_FAILED;

  const token = generateToken();
  const ttlMs = app.config.SESSION_TTL_HOURS * 3_600_000;
  const [, , record] = await app.prisma.$transaction([
    app.prisma.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: now } } }),
    app.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + ttlMs),
        ip: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
      },
    }),
    app.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      select: userSelect,
    }),
  ]);
  return { token, user: record };
}

export async function logout(app: FastifyInstance, sessionId: string): Promise<void> {
  await app.prisma.authSession.deleteMany({ where: { id: sessionId } });
}

export async function changePassword(
  app: FastifyInstance,
  request: FastifyRequest,
  userId: string,
  currentSessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await app.prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw badRequest('Current password is incorrect', [
      { path: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);
  await app.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    // Sign out every other device.
    await tx.authSession.deleteMany({ where: { userId, id: { not: currentSessionId } } });
    await audit(tx, request, {
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: userId,
    });
  });
}

/** Always resolves without revealing whether the email belongs to an account. */
export async function requestPasswordReset(
  app: FastifyInstance,
  request: FastifyRequest,
  email: string,
): Promise<void> {
  const user = await app.prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, status: true, email: true, fullName: true },
  });
  if (!user || user.status !== 'ACTIVE' || !user.email) return;

  const token = generateToken();
  await app.prisma.$transaction([
    app.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    app.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
      },
    }),
  ]);
  await audit(
    app.prisma,
    request,
    {
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    },
    null,
  );

  const link = `${app.config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  await app.mailer.send(
    user.email,
    'Reset your Reading Tracker password',
    `Hello ${user.fullName},\n\nUse this link within ${RESET_TOKEN_MINUTES} minutes to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
  );
}

export async function resetPassword(
  app: FastifyInstance,
  request: FastifyRequest,
  token: string,
  newPassword: string,
): Promise<void> {
  const record = await app.prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');
  }
  const passwordHash = await hashPassword(newPassword);
  await app.prisma.$transaction(async (tx) => {
    // Conditional update makes the token single-use even under concurrent requests.
    const used = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) {
      throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired');
    }
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    });
    await tx.authSession.deleteMany({ where: { userId: record.userId } });
    await audit(
      tx,
      request,
      {
        action: 'auth.password_reset',
        entityType: 'user',
        entityId: record.userId,
      },
      record.userId,
    );
  });
}

// ---------------------------------------------------------------------------
// Student self-registration
// ---------------------------------------------------------------------------

const REGISTRATION_CLOSED = new AppError(
  403,
  'REGISTRATION_CLOSED',
  'Self-registration is closed. Ask your school for an account.',
);

/** Public information for the registration page (classes only while registration is open). */
export async function registrationInfo(app: FastifyInstance) {
  const settings = await getSettings(app.prisma);
  if (!settings.selfRegistrationEnabled) {
    return { enabled: false, institutionName: settings.institutionName, classes: [] };
  }
  const classes = await app.prisma.class.findMany({
    where: { archivedAt: null, generation: { archivedAt: null } },
    select: { id: true, name: true, generation: { select: { id: true, name: true } } },
    orderBy: [{ generation: { name: 'asc' } }, { name: 'asc' }],
  });
  return { enabled: true, institutionName: settings.institutionName, classes };
}

/**
 * Username for students who did not choose one: the student ID in lower case (characters not
 * allowed in usernames become "-"), with a numeric suffix if that name is already taken.
 */
async function usernameFromStudentCode(app: FastifyInstance, studentCode: string) {
  const base =
    studentCode
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .slice(0, 60) || 'student';
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const taken = await app.prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Creates a STUDENT account while self-registration is enabled. The role is always STUDENT;
 * the student is linked to the trainers who already oversee students of the chosen class, and
 * is signed in immediately.
 */
export async function register(
  app: FastifyInstance,
  request: FastifyRequest,
  input: RegisterInput,
): Promise<{ token: string; user: UserRecord }> {
  const settings = await getSettings(app.prisma);
  if (!settings.selfRegistrationEnabled) throw REGISTRATION_CLOSED;
  const cls = await app.prisma.class.findFirst({
    where: { id: input.classId, archivedAt: null, generation: { archivedAt: null } },
    select: { id: true },
  });
  if (!cls) {
    throw badRequest('Choose your class', [{ path: 'classId', message: 'Class not found' }]);
  }
  const username = input.username ?? (await usernameFromStudentCode(app, input.studentCode));
  await assertUnique(app, { ...input, username });
  const passwordHash = await hashPassword(input.password);
  const token = generateToken();
  const now = new Date();

  const user = await app.prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: 'STUDENT',
        username,
        fullName: input.fullName,
        studentCode: input.studentCode,
        email: input.email ?? null,
        gender: input.gender ?? null,
        classId: cls.id,
        passwordHash,
        mustChangePassword: false,
        lastLoginAt: now,
      },
      select: userSelect,
    });
    const trainers = await tx.trainerStudentAssignment.findMany({
      where: { student: { classId: cls.id }, trainer: { status: 'ACTIVE' } },
      distinct: ['trainerId'],
      select: { trainerId: true },
    });
    if (trainers.length > 0) {
      await tx.trainerStudentAssignment.createMany({
        data: trainers.map((t) => ({ trainerId: t.trainerId, studentId: created.id })),
        skipDuplicates: true,
      });
    }
    await tx.authSession.create({
      data: {
        userId: created.id,
        tokenHash: sha256(token),
        expiresAt: new Date(now.getTime() + app.config.SESSION_TTL_HOURS * 3_600_000),
        ip: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
      },
    });
    await audit(
      tx,
      request,
      {
        action: 'user.self_registered',
        entityType: 'user',
        entityId: created.id,
        metadata: { classId: cls.id, trainersAssigned: trainers.length },
      },
      created.id,
    );
    return created;
  });
  return { token, user };
}

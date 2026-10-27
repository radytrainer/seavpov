import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canViewStudent } from '../src/lib/access';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createClass, createUser, loginAs, type Client } from './fixtures';

describe('admin account management & role-based access', () => {
  let ctx: TestContext;
  let admin: Client;
  let adminId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const user = await createUser(ctx.prisma, 'ADMIN');
    adminId = user.id;
    admin = await loginAs(ctx.app, user.username);
  });

  it('forbids students and trainers from admin endpoints', async () => {
    const student = await createUser(ctx.prisma, 'STUDENT');
    const trainer = await createUser(ctx.prisma, 'TRAINER');
    for (const u of [student, trainer]) {
      const session = await loginAs(ctx.app, u.username);
      expect((await session.get('/api/v1/admin/users')).statusCode).toBe(403);
      expect(
        (
          await session.post('/api/v1/admin/users', {
            role: 'ADMIN',
            username: 'evil',
            fullName: 'Evil',
          })
        ).statusCode,
      ).toBe(403);
    }
  });

  it('creates a student with a temporary password that must be changed', async () => {
    const cls = await createClass(ctx.prisma);
    const res = await admin.post('/api/v1/admin/users', {
      role: 'STUDENT',
      username: 'NewStudent',
      fullName: 'ស្រីនាង សុខ',
      studentCode: 's-900',
      classId: cls.id,
      email: '',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toMatchObject({
      username: 'newstudent',
      studentCode: 'S-900',
      fullName: 'ស្រីនាង សុខ',
      email: null,
      mustChangePassword: true,
      class: { id: cls.id },
    });
    expect(body.meta.temporaryPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const session = await loginAs(ctx.app, 'newstudent', body.meta.temporaryPassword);
    expect((await session.get('/api/v1/auth/me')).json().data.mustChangePassword).toBe(true);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'user.created' } })).toBe(1);
  });

  it('requires a student ID for students and reports duplicates per field', async () => {
    const missing = await admin.post('/api/v1/admin/users', {
      role: 'STUDENT',
      username: 'nostudentid',
      fullName: 'X',
    });
    expect(missing.statusCode).toBe(400);

    await createUser(ctx.prisma, 'STUDENT', { username: 'taken', studentCode: 'DUP-1' });
    const dup = await admin.post('/api/v1/admin/users', {
      role: 'STUDENT',
      username: 'taken',
      fullName: 'Y',
      studentCode: 'dup-1',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DUPLICATE_USER');
    expect(
      dup
        .json()
        .error.details.map((d: { path: string }) => d.path)
        .sort(),
    ).toEqual(['studentCode', 'username']);
  });

  it('lists and filters users with pagination', async () => {
    const cls = await createClass(ctx.prisma);
    for (let i = 0; i < 3; i++) await createUser(ctx.prisma, 'STUDENT', { classId: cls.id });
    await createUser(ctx.prisma, 'TRAINER', { fullName: 'Findable Trainer' });
    const page = await admin.get(`/api/v1/admin/users?role=STUDENT&classId=${cls.id}&pageSize=2`);
    expect(page.json().meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(page.json().data).toHaveLength(2);
    const search = await admin.get('/api/v1/admin/users?search=findable');
    expect(search.json().data).toHaveLength(1);
  });

  it('deactivates accounts (revoking sessions) and prevents self-lockout', async () => {
    const student = await createUser(ctx.prisma, 'STUDENT');
    const session = await loginAs(ctx.app, student.username);
    const res = await admin.patch(`/api/v1/admin/users/${student.id}`, { status: 'INACTIVE' });
    expect(res.statusCode).toBe(200);
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'user.deactivated' } })).toBe(1);

    expect(
      (await admin.patch(`/api/v1/admin/users/${adminId}`, { status: 'INACTIVE' })).statusCode,
    ).toBe(400);
    expect(
      (await admin.patch(`/api/v1/admin/users/${adminId}`, { role: 'STUDENT' })).statusCode,
    ).toBe(400);
  });

  it('issues a temporary password on admin reset', async () => {
    const student = await createUser(ctx.prisma, 'STUDENT');
    const res = await admin.post(`/api/v1/admin/users/${student.id}/reset-password`);
    expect(res.statusCode).toBe(200);
    const temp = res.json().data.temporaryPassword;
    await expect(loginAs(ctx.app, student.username, temp)).resolves.toBeDefined();
  });

  describe('trainer assignments', () => {
    it('assigns individual students or a whole class', async () => {
      const trainer = await createUser(ctx.prisma, 'TRAINER');
      const cls = await createClass(ctx.prisma);
      const a = await createUser(ctx.prisma, 'STUDENT', { classId: cls.id });
      const b = await createUser(ctx.prisma, 'STUDENT', { classId: cls.id });
      const c = await createUser(ctx.prisma, 'STUDENT');

      const byId = await admin.post(`/api/v1/admin/trainers/${trainer.id}/students`, {
        studentIds: [c.id],
      });
      expect(byId.json().data.added).toBe(1);
      const byClass = await admin.post(`/api/v1/admin/trainers/${trainer.id}/students`, {
        classId: cls.id,
        studentIds: [c.id],
      });
      expect(byClass.json().data.added).toBe(2); // c already assigned → skipped

      const list = await admin.get(`/api/v1/admin/trainers/${trainer.id}/students`);
      expect(
        list
          .json()
          .data.map((u: { id: string }) => u.id)
          .sort(),
      ).toEqual([a.id, b.id, c.id].sort());

      const removed = await admin.delete(`/api/v1/admin/trainers/${trainer.id}/students/${a.id}`);
      expect(removed.statusCode).toBe(200);
    });

    it('rejects assigning non-students', async () => {
      const trainer = await createUser(ctx.prisma, 'TRAINER');
      const other = await createUser(ctx.prisma, 'TRAINER');
      const res = await admin.post(`/api/v1/admin/trainers/${trainer.id}/students`, {
        studentIds: [other.id],
      });
      expect(res.statusCode).toBe(400);
    });

    it('drives object-level access checks', async () => {
      const trainer = await createUser(ctx.prisma, 'TRAINER');
      const assigned = await createUser(ctx.prisma, 'STUDENT');
      const unassigned = await createUser(ctx.prisma, 'STUDENT');
      await ctx.prisma.trainerStudentAssignment.create({
        data: { trainerId: trainer.id, studentId: assigned.id },
      });
      const asTrainer = {
        userId: trainer.id,
        role: 'TRAINER' as const,
        sessionId: 'x',
        mustChangePassword: false,
      };
      const asStudent = { ...asTrainer, userId: assigned.id, role: 'STUDENT' as const };
      expect(await canViewStudent(ctx.prisma, asTrainer, assigned.id)).toBe(true);
      expect(await canViewStudent(ctx.prisma, asTrainer, unassigned.id)).toBe(false);
      expect(await canViewStudent(ctx.prisma, asStudent, assigned.id)).toBe(true);
      expect(await canViewStudent(ctx.prisma, asStudent, unassigned.id)).toBe(false);
    });
  });
});

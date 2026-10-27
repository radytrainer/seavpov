import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { client, createClass, createUser, loginAs, type Client } from './fixtures';

describe('student self-registration', () => {
  let ctx: TestContext;
  let admin: Client;
  let classId: string;
  let trainerId: string;

  const anon = () => client(ctx.app);
  const body = (extra: Record<string, unknown> = {}) => ({
    fullName: 'ស្រីមុំ ចាន់',
    studentCode: 's-777',
    username: 'NewReader',
    email: '',
    classId,
    password: 'Reading2026x',
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'ADMIN');
    admin = await loginAs(ctx.app, a.username);
    classId = (await createClass(ctx.prisma, 'Class A')).id;
    // trainer already teaches Class A (has a student from it)
    const trainer = await createUser(ctx.prisma, 'TRAINER');
    trainerId = trainer.id;
    const classmate = await createUser(ctx.prisma, 'STUDENT', { classId });
    await ctx.prisma.trainerStudentAssignment.create({
      data: { trainerId, studentId: classmate.id },
    });
  });

  const open = () => admin.patch('/api/v1/admin/settings', { selfRegistrationEnabled: true });

  it('is closed by default and hides the class list', async () => {
    const info = await anon().get('/api/v1/auth/registration');
    expect(info.json().data).toMatchObject({ enabled: false, classes: [] });
    const res = await anon().post('/api/v1/auth/register', body());
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('REGISTRATION_CLOSED');
    expect(await ctx.prisma.user.count({ where: { username: 'newreader' } })).toBe(0);
  });

  it('creates a signed-in student linked to the class trainers when open', async () => {
    await open();
    const info = await anon().get('/api/v1/auth/registration');
    expect(info.json().data.classes.map((c: { id: string }) => c.id)).toEqual([classId]);

    const res = await anon().post('/api/v1/auth/register', body({ role: 'ADMIN' }));
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      role: 'STUDENT',
      username: 'newreader',
      studentCode: 'S-777',
      fullName: 'ស្រីមុំ ចាន់',
      mustChangePassword: false,
      class: { id: classId },
    });
    const cookie = res.cookies.find((c) => c.name === 'rt_session')!;
    const me = await client(ctx.app, `rt_session=${cookie.value}`).get('/api/v1/auth/me');
    expect(me.json().data.username).toBe('newreader');

    const student = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'newreader' } });
    expect(
      await ctx.prisma.trainerStudentAssignment.count({
        where: { trainerId, studentId: student.id },
      }),
    ).toBe(1);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'user.self_registered' },
    });
    expect(log).toMatchObject({ actorId: student.id, metadata: { trainersAssigned: 1 } });
  });

  it('creates the username from the student ID when none is given', async () => {
    await open();
    await createUser(ctx.prisma, 'STUDENT', { username: 'b-2026-01', studentCode: 'OTHER-1' });
    const res = await anon().post('/api/v1/auth/register', {
      fullName: 'No Username',
      studentCode: 'b/2026/01',
      classId,
      password: 'Reading2026x',
    });
    expect(res.statusCode).toBe(201);
    // "B/2026/01" → "b-2026-01" is taken, so a suffix is added.
    expect(res.json().data).toMatchObject({ studentCode: 'B/2026/01', username: 'b-2026-01-2' });
    // The student can sign in with the student ID.
    await expect(loginAs(ctx.app, 'b/2026/01', 'Reading2026x')).resolves.toBeDefined();
  });

  it('validates input, uniqueness and the class', async () => {
    await open();
    await anon().post('/api/v1/auth/register', body());
    const dup = await anon().post('/api/v1/auth/register', body({ username: 'other' }));
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.details[0].path).toBe('studentCode');
    const weak = await anon().post(
      '/api/v1/auth/register',
      body({ username: 'weak', studentCode: 'S-1', password: 'short' }),
    );
    expect(weak.statusCode).toBe(400);
    const archived = await createClass(ctx.prisma, 'Old');
    await ctx.prisma.class.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const badClass = await anon().post(
      '/api/v1/auth/register',
      body({ username: 'x1', studentCode: 'S-2', classId: archived.id }),
    );
    expect(badClass.statusCode).toBe(400);
  });

  it('stops accepting registrations as soon as it is turned off', async () => {
    await open();
    await admin.patch('/api/v1/admin/settings', { selfRegistrationEnabled: false });
    expect((await anon().post('/api/v1/auth/register', body())).statusCode).toBe(403);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'settings.updated' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.metadata).toMatchObject({ selfRegistrationEnabled: { from: true, to: false } });
  });

  it('lets admins find students without a trainer', async () => {
    await createUser(ctx.prisma, 'STUDENT', { fullName: 'Lonely Student' });
    const res = await admin.get('/api/v1/admin/users?unassigned=true');
    expect(res.json().data.map((u: { fullName: string }) => u.fullName)).toEqual([
      'Lonely Student',
    ]);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Mailer } from '../src/lib/mailer';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { TEST_PASSWORD, client, createUser, loginAs } from './fixtures';

const sentMail: { to: string; text: string }[] = [];
const captureMailer: Mailer = {
  async send(to, _subject, text) {
    sentMail.push({ to, text });
    return true;
  },
};

describe('authentication', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ mailer: captureMailer });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    sentMail.length = 0;
  });

  const anon = () => client(ctx.app);

  it('logs in with username, email or student ID and sets a secure session cookie', async () => {
    const student = await createUser(ctx.prisma, 'STUDENT', {
      username: 'neang',
      email: 'neang@school.edu',
      studentCode: 'S-100',
    });
    for (const identifier of ['neang', 'NEANG@school.edu', 's-100']) {
      const res = await anon().post('/api/v1/auth/login', { identifier, password: TEST_PASSWORD });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe(student.id);
      const cookie = res.cookies.find((c) => c.name === 'rt_session');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Lax');
      expect(res.body).not.toContain('passwordHash');
    }
  });

  it('stores passwords as Argon2id hashes', async () => {
    const user = await createUser(ctx.prisma, 'STUDENT');
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it('returns the same error for unknown users and wrong passwords', async () => {
    await createUser(ctx.prisma, 'STUDENT', { username: 'known' });
    const wrong = await anon().post('/api/v1/auth/login', {
      identifier: 'known',
      password: 'nope',
    });
    const unknown = await anon().post('/api/v1/auth/login', {
      identifier: 'ghost',
      password: 'nope',
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('locks the account after repeated failures', async () => {
    await createUser(ctx.prisma, 'STUDENT', { username: 'target' });
    for (let i = 0; i < 5; i++) {
      await anon().post('/api/v1/auth/login', { identifier: 'target', password: 'wrong' });
    }
    const res = await anon().post('/api/v1/auth/login', {
      identifier: 'target',
      password: TEST_PASSWORD,
    });
    expect(res.statusCode).toBe(401);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'target' } });
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await ctx.prisma.auditLog.count({ where: { action: 'auth.locked' } })).toBe(1);
  });

  it('rejects inactive accounts', async () => {
    await createUser(ctx.prisma, 'STUDENT', { username: 'gone', status: 'INACTIVE' });
    const res = await anon().post('/api/v1/auth/login', {
      identifier: 'gone',
      password: TEST_PASSWORD,
    });
    expect(res.statusCode).toBe(401);
  });

  it('requires authentication for /me and rejects the session after logout', async () => {
    expect((await anon().get('/api/v1/auth/me')).statusCode).toBe(401);
    const user = await createUser(ctx.prisma, 'STUDENT');
    const session = await loginAs(ctx.app, user.username);
    const me = await session.get('/api/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().data).toMatchObject({ id: user.id, role: 'STUDENT' });

    expect((await session.post('/api/v1/auth/logout')).statusCode).toBe(200);
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect(await ctx.prisma.authSession.count()).toBe(0);
  });

  it('ignores forged or expired session cookies', async () => {
    expect((await client(ctx.app, 'rt_session=forged').get('/api/v1/auth/me')).statusCode).toBe(
      401,
    );
    const user = await createUser(ctx.prisma, 'STUDENT');
    const session = await loginAs(ctx.app, user.username);
    await ctx.prisma.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('revokes sessions immediately when an account is deactivated', async () => {
    const user = await createUser(ctx.prisma, 'STUDENT');
    const session = await loginAs(ctx.app, user.username);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('lets users update only their permitted profile fields', async () => {
    const user = await createUser(ctx.prisma, 'STUDENT');
    const session = await loginAs(ctx.app, user.username);
    const res = await session.patch('/api/v1/auth/me', {
      email: 'New@Mail.edu',
      gender: 'FEMALE',
      role: 'ADMIN',
      fullName: 'Hacker',
    });
    expect(res.statusCode).toBe(200);
    const updated = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.email).toBe('new@mail.edu');
    expect(updated.role).toBe('STUDENT');
    expect(updated.fullName).toBe(user.fullName);
  });

  describe('password change', () => {
    it('validates the current password and strength rules', async () => {
      const user = await createUser(ctx.prisma, 'STUDENT');
      const session = await loginAs(ctx.app, user.username);
      const wrong = await session.post('/api/v1/auth/change-password', {
        currentPassword: 'incorrect',
        newPassword: 'NewPassword456',
      });
      expect(wrong.statusCode).toBe(400);
      const weak = await session.post('/api/v1/auth/change-password', {
        currentPassword: TEST_PASSWORD,
        newPassword: 'short',
      });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('changes the password and signs out other devices', async () => {
      const user = await createUser(ctx.prisma, 'STUDENT');
      const deviceA = await loginAs(ctx.app, user.username);
      const deviceB = await loginAs(ctx.app, user.username);
      const res = await deviceA.post('/api/v1/auth/change-password', {
        currentPassword: TEST_PASSWORD,
        newPassword: 'NewPassword456',
      });
      expect(res.statusCode).toBe(200);
      expect((await deviceA.get('/api/v1/auth/me')).statusCode).toBe(200);
      expect((await deviceB.get('/api/v1/auth/me')).statusCode).toBe(401);
      await expect(loginAs(ctx.app, user.username, 'NewPassword456')).resolves.toBeDefined();
    });

    it('blocks other endpoints until a required password change is done', async () => {
      const admin = await createUser(ctx.prisma, 'ADMIN', { mustChangePassword: true });
      const session = await loginAs(ctx.app, admin.username);
      const blocked = await session.get('/api/v1/admin/users');
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');
      expect((await session.get('/api/v1/auth/me')).statusCode).toBe(200);
      await session.post('/api/v1/auth/change-password', {
        currentPassword: TEST_PASSWORD,
        newPassword: 'NewPassword456',
      });
      expect((await session.get('/api/v1/admin/users')).statusCode).toBe(200);
    });
  });

  describe('password reset', () => {
    const tokenFromMail = () => {
      const match = /token=([^\s]+)/.exec(sentMail.at(-1)?.text ?? '');
      return decodeURIComponent(match![1]!);
    };

    it('responds identically for unknown emails and sends nothing', async () => {
      const res = await anon().post('/api/v1/auth/forgot-password', { email: 'nobody@x.edu' });
      expect(res.statusCode).toBe(202);
      expect(sentMail).toHaveLength(0);
    });

    it('resets the password with a single-use token and revokes sessions', async () => {
      const user = await createUser(ctx.prisma, 'STUDENT', { email: 'reset@school.edu' });
      const session = await loginAs(ctx.app, user.username);
      const res = await anon().post('/api/v1/auth/forgot-password', { email: 'reset@school.edu' });
      expect(res.statusCode).toBe(202);
      expect(sentMail).toHaveLength(1);
      const token = tokenFromMail();
      // Only the hash is stored.
      const stored = await ctx.prisma.passwordResetToken.findFirstOrThrow();
      expect(stored.tokenHash).not.toBe(token);

      const reset = await anon().post('/api/v1/auth/reset-password', {
        token,
        newPassword: 'BrandNew789x',
      });
      expect(reset.statusCode).toBe(200);
      expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
      await expect(loginAs(ctx.app, user.username, 'BrandNew789x')).resolves.toBeDefined();

      const reuse = await anon().post('/api/v1/auth/reset-password', {
        token,
        newPassword: 'Another789xy',
      });
      expect(reuse.statusCode).toBe(400);
      expect(reuse.json().error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('rejects expired tokens', async () => {
      await createUser(ctx.prisma, 'STUDENT', { email: 'late@school.edu' });
      await anon().post('/api/v1/auth/forgot-password', { email: 'late@school.edu' });
      await ctx.prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await anon().post('/api/v1/auth/reset-password', {
        token: tokenFromMail(),
        newPassword: 'BrandNew789x',
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

describe('login rate limiting', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp({ rateLimit: true });
    await resetDatabase(ctx.prisma);
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('returns 429 after too many attempts from one IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await client(ctx.app).post('/api/v1/auth/login', {
        identifier: 'nobody',
        password: 'x',
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

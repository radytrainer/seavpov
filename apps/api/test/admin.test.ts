import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/csv-parse';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

describe('administration', () => {
  let ctx: TestContext;
  let admin: Client;
  let trainer: Client;
  let genId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'ADMIN');
    const t = await createUser(ctx.prisma, 'TRAINER');
    admin = await loginAs(ctx.app, a.username);
    trainer = await loginAs(ctx.app, t.username);
    const gen = await admin.post('/api/v1/admin/generations', {
      name: 'Generation 2026',
      startYear: 2026,
    });
    genId = gen.json().data.id;
    await admin.post('/api/v1/admin/classes', { name: 'Class A', generationId: genId });
  });

  it('restricts every admin endpoint to administrators', async () => {
    for (const url of [
      '/api/v1/admin/overview',
      '/api/v1/admin/settings',
      '/api/v1/admin/audit-logs',
      '/api/v1/admin/classes',
    ]) {
      expect((await trainer.get(url)).statusCode, url).toBe(403);
    }
    expect(
      (await trainer.post('/api/v1/admin/users/import', { csv: 'x', dryRun: true })).statusCode,
    ).toBe(403);
    expect((await trainer.patch('/api/v1/admin/settings', { minDailyMinutes: 1 })).statusCode).toBe(
      403,
    );
  });

  describe('CSV import', () => {
    const header = 'student_id,full_name,username,email,gender,generation,class';

    it('imports a valid file with temporary passwords', async () => {
      const csv = [
        header,
        'S-001,Sok Dara,sokdara,dara@school.edu,male,Generation 2026,Class A',
        '"S-002","ស្រីនាង, សុខ",sreyneang,,FEMALE,,class a',
      ].join('\r\n');
      const dry = await admin.post('/api/v1/admin/users/import', { csv, dryRun: true });
      expect(dry.json().data).toMatchObject({
        dryRun: true,
        totalRows: 2,
        valid: 2,
        errors: [],
        created: [],
      });
      expect(await ctx.prisma.user.count({ where: { role: 'STUDENT' } })).toBe(0);

      const res = await admin.post('/api/v1/admin/users/import', { csv, dryRun: false });
      expect(res.statusCode).toBe(200);
      const created = res.json().data.created;
      expect(created).toHaveLength(2);
      expect(created[1]).toMatchObject({ studentCode: 'S-002', fullName: 'ស្រីនាង, សុខ' });
      const student = await ctx.prisma.user.findUniqueOrThrow({
        where: { username: 'sreyneang' },
        include: { class: true },
      });
      expect(student).toMatchObject({ mustChangePassword: true, gender: 'FEMALE', email: null });
      expect(student.class?.name).toBe('Class A');
      await expect(
        loginAs(ctx.app, 'sokdara', created[0].temporaryPassword),
      ).resolves.toBeDefined();
      expect(await ctx.prisma.auditLog.count({ where: { action: 'user.imported' } })).toBe(1);
    });

    it('reports every invalid row clearly and creates nothing', async () => {
      await createUser(ctx.prisma, 'STUDENT', { studentCode: 'S-EXIST', username: 'existing' });
      const csv = [
        header,
        'S-010,Valid Student,valid1,,,,',
        ',Missing Id,missingid,,,,', // row 3
        'S-011,Bad Email,bademail,not-an-email,,,', // row 4
        'S-012,Bad Gender,badgender,,robot,,', // row 5
        'S-010,Duplicate Id,dupid,,,,', // row 6: duplicate of row 2
        'S-EXIST,Existing,newname,,,,', // row 7: already in DB
        'S-013,No Class,noclass,,,Generation 2026,Class Z', // row 8
        'S-014,Bad User,bad user!,,,,', // row 9
      ].join('\n');
      const res = await admin.post('/api/v1/admin/users/import', { csv, dryRun: false });
      const data = res.json().data;
      expect(data.created).toHaveLength(0);
      expect(data.valid).toBe(1);
      const byRow = (row: number) => data.errors.filter((e: { row: number }) => e.row === row);
      expect(byRow(3)[0]).toMatchObject({ field: 'student_id' });
      expect(byRow(4)[0]).toMatchObject({ field: 'email', message: 'Invalid email' });
      expect(byRow(5)[0].field).toBe('gender');
      expect(byRow(6)[0]).toMatchObject({ field: 'student_id', message: 'Duplicate of row 2' });
      expect(byRow(7)[0]).toMatchObject({
        field: 'student_id',
        message: 'Already used by an existing account',
      });
      expect(byRow(8)[0].message).toContain('Class Z');
      expect(byRow(9)[0].field).toBe('username');
      expect(await ctx.prisma.user.count({ where: { role: 'STUDENT' } })).toBe(1); // only the pre-existing one
    });

    it('rejects files with missing or unknown columns', async () => {
      const missing = await admin.post('/api/v1/admin/users/import', {
        csv: 'full_name\nX',
        dryRun: true,
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error.message).toContain('student_id');
      const unknown = await admin.post('/api/v1/admin/users/import', {
        csv: `${header},password\nS-1,X,x,,,,,secret`,
        dryRun: true,
      });
      expect(unknown.json().error.message).toContain('password');
      const broken = await admin.post('/api/v1/admin/users/import', {
        csv: `${header}\n"S-1,X`,
        dryRun: true,
      });
      expect(broken.statusCode).toBe(400);
    });
  });

  describe('settings', () => {
    it('updates settings, validates them and records the change', async () => {
      const res = await admin.patch('/api/v1/admin/settings', {
        minDailyMinutes: 15,
        timeZone: 'Asia/Bangkok',
      });
      expect(res.json().data).toMatchObject({ minDailyMinutes: 15, timeZone: 'Asia/Bangkok' });
      const log = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'settings.updated' },
      });
      expect(log.metadata).toMatchObject({ minDailyMinutes: { from: 10, to: 15 } });
      expect(
        (await admin.patch('/api/v1/admin/settings', { timeZone: 'Mars/Olympus' })).statusCode,
      ).toBe(400);
      expect(
        (await admin.patch('/api/v1/admin/settings', { maxSessionMinutes: 5 })).statusCode,
      ).toBe(400);
    });
  });

  describe('organisation', () => {
    it('manages generations and classes with archiving', async () => {
      const dup = await admin.post('/api/v1/admin/classes', {
        name: 'Class A',
        generationId: genId,
      });
      expect(dup.statusCode).toBe(409);
      const classes = (await admin.get('/api/v1/admin/classes')).json().data;
      const res = await admin.patch(`/api/v1/admin/classes/${classes[0].id}`, { archived: true });
      expect(res.json().data.archivedAt).not.toBeNull();
      expect(await ctx.prisma.class.count()).toBe(1); // archived, not deleted
    });

    it('lists audit logs with filters and actor names', async () => {
      const res = await admin.get('/api/v1/admin/audit-logs?action=class');
      const body = res.json();
      expect(body.meta.total).toBe(1);
      expect(body.data[0]).toMatchObject({
        action: 'class.created',
        actor: { fullName: expect.any(String) },
      });
      expect(
        (await admin.get('/api/v1/admin/audit-logs?entityType=generation')).json().meta.total,
      ).toBe(1);
    });

    it('returns overview counts', async () => {
      await alicePending();
      const res = await admin.get('/api/v1/admin/overview');
      expect(res.json().data).toMatchObject({
        admins: 1,
        trainers: 1,
        students: 1,
        pendingBooks: 1,
        classes: 1,
      });
    });
  });

  async function alicePending() {
    const s = await createUser(ctx.prisma, 'STUDENT');
    const c = await loginAs(ctx.app, s.username);
    await c.post('/api/v1/library-books', { title: 'Pending book' });
  }
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\n\n1,\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', ''],
    ]);
  });
});

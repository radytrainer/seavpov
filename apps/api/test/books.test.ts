import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestContext } from './helpers';
import { createUser, loginAs, type Client } from './fixtures';

describe('library catalog and student books', () => {
  let ctx: TestContext;
  let admin: Client;
  let alice: Client;
  let bob: Client;
  let aliceId: string;
  let categoryId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    const a = await createUser(ctx.prisma, 'ADMIN');
    const s1 = await createUser(ctx.prisma, 'STUDENT');
    const s2 = await createUser(ctx.prisma, 'STUDENT');
    aliceId = s1.id;
    admin = await loginAs(ctx.app, a.username);
    alice = await loginAs(ctx.app, s1.username);
    bob = await loginAs(ctx.app, s2.username);
    categoryId = (await ctx.prisma.bookCategory.create({ data: { name: 'Science' } })).id;
  });

  async function catalogBook(title = 'Cosmos', extra: Record<string, unknown> = {}) {
    const res = await admin.post('/api/v1/library-books', {
      title,
      author: 'Carl Sagan',
      categoryId,
      totalPages: 200,
      ...extra,
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as { id: string; status: string };
  }

  describe('catalog', () => {
    it('admins create approved entries; students create pending entries', async () => {
      const book = await catalogBook();
      expect(book.status).toBe('APPROVED');
      const res = await alice.post('/api/v1/library-books', { title: 'My Find' });
      expect(res.json().data.status).toBe('PENDING');
    });

    it('detects duplicates by ISBN, library code and normalized title + author', async () => {
      await catalogBook('Cosmos', { isbn: '978-0-345-53943-4', libraryCode: 'LIB-1' });
      const byKey = await alice.post('/api/v1/library-books', {
        title: '  cosmos ',
        author: 'CARL   sagan',
      });
      expect(byKey.statusCode).toBe(409);
      expect(byKey.json().error.code).toBe('DUPLICATE_BOOK');
      expect(byKey.json().error.details.existing.title).toBe('Cosmos');
      const byIsbn = await alice.post('/api/v1/library-books', {
        title: 'Other',
        isbn: '9780345539434',
      });
      expect(byIsbn.statusCode).toBe(409);
      const byCode = await alice.post('/api/v1/library-books', {
        title: 'X',
        libraryCode: 'LIB-1',
      });
      expect(byCode.statusCode).toBe(409);
    });

    it("hides other students' pending submissions", async () => {
      const pending = (await bob.post('/api/v1/library-books', { title: 'Secret' })).json().data;
      expect((await alice.get(`/api/v1/library-books/${pending.id}`)).statusCode).toBe(404);
      const list = await alice.get('/api/v1/library-books?search=secret');
      expect(list.json().meta.total).toBe(0);
      expect((await bob.get(`/api/v1/library-books/${pending.id}`)).statusCode).toBe(200);
    });

    it('validates input (pages, ISBN, https cover URLs)', async () => {
      const res = await admin.post('/api/v1/library-books', {
        title: 'Bad',
        totalPages: -3,
        isbn: '123',
        coverImageUrl: 'javascript:alert(1)',
      });
      expect(res.statusCode).toBe(400);
      const paths = res.json().error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['totalPages', 'isbn', 'coverImageUrl']));
    });

    it('only admins can edit or approve catalog entries', async () => {
      const pending = (await alice.post('/api/v1/library-books', { title: 'Mine' })).json().data;
      expect(
        (await alice.patch(`/api/v1/library-books/${pending.id}`, { status: 'APPROVED' }))
          .statusCode,
      ).toBe(403);
      const approved = await admin.patch(`/api/v1/library-books/${pending.id}`, {
        status: 'APPROVED',
      });
      expect(approved.json().data.status).toBe('APPROVED');
      expect(await ctx.prisma.auditLog.count({ where: { action: 'library_book.approved' } })).toBe(
        1,
      );
    });

    it('merges duplicate entries and moves student records', async () => {
      const target = await catalogBook();
      const dup = (await alice.post('/api/v1/library-books', { title: 'Cosmos (copy)' })).json()
        .data;
      await alice.post('/api/v1/student-books', { libraryBookId: dup.id });
      const res = await admin.post(`/api/v1/library-books/${dup.id}/merge`, {
        targetId: target.id,
      });
      expect(res.json().data.moved).toBe(1);
      const record = await ctx.prisma.studentBook.findFirstOrThrow({
        where: { studentId: aliceId },
      });
      expect(record.libraryBookId).toBe(target.id);
    });
  });

  describe('my books', () => {
    it('reuses one catalog entry for many students', async () => {
      const book = await catalogBook();
      expect(
        (await alice.post('/api/v1/student-books', { libraryBookId: book.id })).statusCode,
      ).toBe(201);
      expect((await bob.post('/api/v1/student-books', { libraryBookId: book.id })).statusCode).toBe(
        201,
      );
      expect(await ctx.prisma.libraryBook.count()).toBe(1);
    });

    it('creates a new catalog entry inline and rejects tracking the same book twice', async () => {
      const res = await alice.post('/api/v1/student-books', {
        newBook: { title: 'ព្រះអាទិត្យ', author: 'អ្នកនិពន្ធ', totalPages: 150 },
        status: 'READING',
      });
      expect(res.statusCode).toBe(201);
      const body = res.json().data;
      expect(body).toMatchObject({ status: 'READING', totalPages: 150, progressPercent: 0 });
      expect(body.book.status).toBe('PENDING');
      expect(body.startedAt).not.toBeNull();

      const again = await alice.post('/api/v1/student-books', { libraryBookId: body.book.id });
      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('ALREADY_TRACKING');
    });

    it("never exposes or modifies another student's records", async () => {
      const book = await catalogBook();
      const mine = (await alice.post('/api/v1/student-books', { libraryBookId: book.id })).json()
        .data;
      expect((await bob.get(`/api/v1/student-books/${mine.id}`)).statusCode).toBe(404);
      expect(
        (await bob.patch(`/api/v1/student-books/${mine.id}`, { currentPage: 10 })).statusCode,
      ).toBe(404);
      expect(
        (await bob.patch(`/api/v1/student-books/${mine.id}/status`, { status: 'ABANDONED' }))
          .statusCode,
      ).toBe(404);
      const bobsList = await bob.get(`/api/v1/student-books?studentId=${aliceId}`);
      expect(bobsList.json().meta.total).toBe(0);
    });

    it('tracks progress and validates page numbers', async () => {
      const book = await catalogBook();
      const mine = (await alice.post('/api/v1/student-books', { libraryBookId: book.id })).json()
        .data;
      const ok = await alice.patch(`/api/v1/student-books/${mine.id}`, { currentPage: 50 });
      expect(ok.json().data.progressPercent).toBe(25);
      const tooFar = await alice.patch(`/api/v1/student-books/${mine.id}`, { currentPage: 201 });
      expect(tooFar.statusCode).toBe(400);
      // A personal page-count override (different edition) changes the limit.
      const override = await alice.patch(`/api/v1/student-books/${mine.id}`, {
        totalPages: 400,
        currentPage: 300,
      });
      expect(override.json().data).toMatchObject({ totalPages: 400, progressPercent: 75 });
    });

    it('manages status dates', async () => {
      const book = await catalogBook();
      const mine = (await alice.post('/api/v1/student-books', { libraryBookId: book.id })).json()
        .data;
      expect(mine.startedAt).toBeNull();
      const done = await alice.patch(`/api/v1/student-books/${mine.id}/status`, {
        status: 'COMPLETED',
      });
      expect(done.json().data).toMatchObject({ status: 'COMPLETED', currentPage: 200 });
      expect(done.json().data.completedAt).not.toBeNull();
      expect(done.json().data.startedAt).not.toBeNull();
      const reopened = await alice.patch(`/api/v1/student-books/${mine.id}/status`, {
        status: 'READING',
      });
      expect(reopened.json().data.completedAt).toBeNull();
    });

    it('searches, filters, sorts, paginates and archives', async () => {
      const titles = ['Alpha', 'Beta', 'Gamma'];
      for (const t of titles) {
        const b = await catalogBook(t, { author: `${t} Author` });
        await alice.post('/api/v1/student-books', { libraryBookId: b.id });
      }
      const sorted = await alice.get('/api/v1/student-books?sort=title&pageSize=2');
      expect(sorted.json().data.map((r: { book: { title: string } }) => r.book.title)).toEqual([
        'Alpha',
        'Beta',
      ]);
      expect(sorted.json().meta.total).toBe(3);
      const search = await alice.get('/api/v1/student-books?search=gamma%20auth');
      expect(search.json().meta.total).toBe(1);
      const byCategory = await alice.get(`/api/v1/student-books?categoryId=${categoryId}`);
      expect(byCategory.json().meta.total).toBe(3);

      const first = sorted.json().data[0];
      await alice.patch(`/api/v1/student-books/${first.id}`, { archived: true });
      expect((await alice.get('/api/v1/student-books')).json().meta.total).toBe(2);
      expect((await alice.get('/api/v1/student-books?archived=true')).json().meta.total).toBe(1);
    });

    it('lets assigned trainers read but not modify student books', async () => {
      const trainer = await createUser(ctx.prisma, 'TRAINER');
      await ctx.prisma.trainerStudentAssignment.create({
        data: { trainerId: trainer.id, studentId: aliceId },
      });
      const t = await loginAs(ctx.app, trainer.username);
      const book = await catalogBook();
      const mine = (await alice.post('/api/v1/student-books', { libraryBookId: book.id })).json()
        .data;
      expect((await t.get(`/api/v1/student-books/${mine.id}`)).statusCode).toBe(200);
      expect(
        (await t.patch(`/api/v1/student-books/${mine.id}`, { currentPage: 5 })).statusCode,
      ).toBe(403);
    });
  });

  it('manages categories (admin only, archive instead of delete)', async () => {
    expect((await alice.post('/api/v1/admin/categories', { name: 'X' })).statusCode).toBe(403);
    const created = await admin.post('/api/v1/admin/categories', { name: 'Poetry' });
    expect(created.statusCode).toBe(201);
    const dup = await admin.post('/api/v1/admin/categories', { name: 'Poetry' });
    expect(dup.statusCode).toBe(409);
    await admin.patch(`/api/v1/admin/categories/${created.json().data.id}`, { archived: true });
    const active = await alice.get('/api/v1/categories');
    expect(active.json().data.map((c: { name: string }) => c.name)).toEqual(['Science']);
  });
});

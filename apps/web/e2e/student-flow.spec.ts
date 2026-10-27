import { expect, test } from '@playwright/test';
import { apiFromPage, expectAccessible, login, unique } from './helpers';

test.describe('student reading workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'student4');
    // Start from a clean state: discard a session left running by an earlier run.
    const active = await apiFromPage<{ data: { id: string } | null }>(
      page,
      'GET',
      '/reading-sessions/active',
    );
    if (active.body.data)
      await apiFromPage(page, 'POST', `/reading-sessions/${active.body.data.id}/cancel`, {});
  });

  test('add a book, time a session with pause/refresh, finish with pages and reflect', async ({
    page,
  }) => {
    const title = unique('E2E Book');

    // Add a physical book that is not yet in the catalog.
    await page.goto('/books');
    await page.getByRole('button', { name: 'Add book' }).first().click();
    await page.getByRole('button', { name: /Can’t find it/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel(/Author/).fill('E2E Author');
    await dialog.getByLabel(/Total pages/).fill('150');
    await dialog.getByRole('button', { name: 'Add book', exact: true }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();

    // Start reading from the book page.
    await page.getByRole('link', { name: 'Start reading' }).click();
    await page.getByRole('button', { name: 'Start reading' }).click();
    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    await expect(page.getByText('Reading', { exact: true })).toBeVisible();

    // Pause, then resume.
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    const pausedValue = await timer.textContent();
    await page.waitForTimeout(2_000);
    expect(await timer.textContent()).toBe(pausedValue); // paused time is not counted
    await page.getByRole('button', { name: 'Resume' }).click();

    // Refresh: the timer is restored from the server, not reset.
    await page.waitForTimeout(1_500);
    await page.reload();
    await expect(timer).toBeVisible();
    await expect(timer).not.toHaveText('0:00');

    // Finish with an end page.
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByLabel(/Page you stopped on/).fill('12');
    await page.getByRole('button', { name: 'Save session' }).click();
    await expect(page.getByRole('heading', { name: 'Session saved' })).toBeVisible();

    const history = await apiFromPage<{
      data: { durationSeconds: number; pagesRead: number; book: { title: string } }[];
    }>(page, 'GET', '/reading-sessions?pageSize=1');
    const session = history.body.data[0]!;
    expect(session.book.title).toBe(title);
    expect(session.pagesRead).toBe(12);
    // ~2 s before pause + ~1.5 s after resume (+ request time); paused 2 s excluded.
    expect(session.durationSeconds).toBeGreaterThanOrEqual(3);
    expect(session.durationSeconds).toBeLessThan(9);

    // Write a reflection (Khmer + English), then edit it.
    await page.getByRole('link', { name: 'Write a reflection' }).click();
    await page.getByLabel('What did I learn?').fill('ខ្ញុំបានរៀនអំពីពេលវេលា — time is relative');
    await page.getByRole('radio', { name: /4/ }).check({ force: true });
    await page.getByLabel(/Tags/).fill('science, e2e');
    await page.getByRole('button', { name: 'Save reflection' }).click();
    await expect(page.getByText('ខ្ញុំបានរៀនអំពីពេលវេលា — time is relative')).toBeVisible();
    await expect(page.getByText('Understanding:')).toContainText('4/5');

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('How can I apply this knowledge?').fill('Plan my study time better');
    await page.getByRole('button', { name: 'Save reflection' }).click();
    await expect(page.getByText('Plan my study time better')).toBeVisible();

    // History and analytics show the session.
    await page.goto('/history');
    await expect(page.locator('main li', { hasText: title }).first()).toBeVisible();
    await expectAccessible(page);
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: 'My Analytics' })).toBeVisible();
    await expectAccessible(page);
    await page.goto('/dashboard');
    await expect(page.locator('main li', { hasText: title }).first()).toBeVisible();
    await expectAccessible(page);
  });

  test('duplicate start requests do not create duplicate sessions; invalid pages are rejected', async ({
    page,
  }) => {
    const books = await apiFromPage<{ data: { id: string; status: string }[] }>(
      page,
      'GET',
      '/student-books?pageSize=50',
    );
    const book = books.body.data.find((b) => b.status === 'READING' || b.status === 'PLANNED');
    test.skip(!book, 'needs a readable book (created by the previous test)');
    const [a, b] = await Promise.all([
      apiFromPage(page, 'POST', '/reading-sessions/start', { studentBookId: book!.id }),
      apiFromPage(page, 'POST', '/reading-sessions/start', { studentBookId: book!.id }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);

    const active = await apiFromPage<{ data: { id: string; startPage: number } }>(
      page,
      'GET',
      '/reading-sessions/active',
    );
    const bad = await apiFromPage(page, 'POST', `/reading-sessions/${active.body.data.id}/finish`, {
      endPage: -5,
    });
    expect(bad.status).toBe(400);
    const manual = await apiFromPage(page, 'POST', '/reading-sessions/manual', {
      studentBookId: book!.id,
      startedAt: '2030-01-01T10:00:00Z',
      endedAt: '2030-01-01T09:00:00Z',
    });
    expect(manual.status).toBe(400);
    await apiFromPage(page, 'POST', `/reading-sessions/${active.body.data.id}/cancel`, {});
  });
});

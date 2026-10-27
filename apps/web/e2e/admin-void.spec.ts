import { expect, test } from '@playwright/test';
import { apiFromPage, expectAccessible, login, logout } from './helpers';

test.describe('administrative corrections and summary reports', () => {
  test('admin voids a session with a reason; it no longer counts', async ({ page }) => {
    // student1 records a manual session in a random free slot of the last two days.
    await login(page, 'student1');
    const books = await apiFromPage<{ data: { id: string }[] }>(
      page,
      'GET',
      '/student-books?pageSize=1',
    );
    test.skip(books.body.data.length === 0, 'student1 needs a book');
    const slot = Date.now() - (1 + Math.floor(Math.random() * 280)) * 10 * 60_000;
    const created = await apiFromPage<{ data: { id: string } }>(
      page,
      'POST',
      '/reading-sessions/manual',
      {
        studentBookId: books.body.data[0]!.id,
        startedAt: new Date(slot).toISOString(),
        endedAt: new Date(slot + 7 * 60_000).toISOString(),
      },
    );
    test.skip(created.status !== 201, 'time slot overlapped an earlier run');
    const me = await apiFromPage<{ data: { id: string } }>(page, 'GET', '/auth/me');
    await logout(page);

    await login(page, 'admin');
    await page.goto(`/admin/students/${me.body.data.id}?tab=sessions`);
    await expectAccessible(page);
    const row = page.locator(`li[data-session-id="${created.body.data.id}"]`);
    await expect(row).toContainText('7m');
    await row.getByRole('button', { name: /Void session/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Void session' })).toBeDisabled();
    await dialog.getByLabel('Reason').fill('E2E: recorded by mistake');
    await dialog.getByRole('button', { name: 'Void session' }).click();
    await expect(page.getByText('Session voided')).toBeVisible();

    const session = await apiFromPage<{ data: { status: string } }>(
      page,
      'GET',
      `/reading-sessions/${created.body.data.id}`,
    );
    expect(session.body.data.status).toBe('CANCELLED');
    const audit = await apiFromPage<{ data: { metadata: { reason: string } }[] }>(
      page,
      'GET',
      '/admin/audit-logs?action=session.voided&pageSize=1',
    );
    expect(audit.body.data[0]!.metadata.reason).toBe('E2E: recorded by mistake');
  });

  test('weekly and monthly summary report with grouping', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/reports?type=period-summary');
    await expect(page.getByRole('columnheader', { name: 'Week starting' })).toBeVisible();
    await page.getByLabel('Group by').selectOption('month');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('columnheader', { name: 'Month' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
      'href',
      /period-summary\?.*granularity=month/,
    );
  });
});

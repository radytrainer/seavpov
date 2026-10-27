import { expect, test } from '@playwright/test';
import { apiFromPage, expectAccessible, login, logout } from './helpers';

test.describe('authorization', () => {
  test("students cannot open another student's book, session or reflection", async ({ page }) => {
    await login(page, 'student1');
    const books = await apiFromPage<{ data: { id: string }[] }>(
      page,
      'GET',
      '/student-books?pageSize=1',
    );
    const sessions = await apiFromPage<{ data: { id: string; reflectionId: string | null }[] }>(
      page,
      'GET',
      '/reading-sessions?pageSize=20',
    );
    const bookId = books.body.data[0]?.id;
    const sessionId = sessions.body.data[0]?.id;
    const reflectionId = sessions.body.data.find((s) => s.reflectionId)?.reflectionId;
    test.skip(!bookId, 'needs seeded activity for student1');
    await logout(page);

    await login(page, 'student5');
    await page.goto(`/books/${bookId}`);
    await expect(page.getByText('Page not found')).toBeVisible();
    expect((await apiFromPage(page, 'GET', `/student-books/${bookId}`)).status).toBe(404);
    expect(
      (await apiFromPage(page, 'PATCH', `/student-books/${bookId}`, { currentPage: 1 })).status,
    ).toBe(404);
    if (sessionId) {
      expect((await apiFromPage(page, 'GET', `/reading-sessions/${sessionId}`)).status).toBe(404);
      expect(
        (await apiFromPage(page, 'POST', `/reading-sessions/${sessionId}/finish`, {})).status,
      ).toBe(404);
    }
    if (reflectionId) {
      await page.goto(`/reflections/${reflectionId}`);
      await expect(page.getByText('Page not found')).toBeVisible();
    }
  });

  test('trainers see assigned students only', async ({ page }) => {
    await login(page, 'trainer1');
    await page.goto('/trainer/students');
    await expect(page.getByRole('link', { name: 'Srey Neang' }).first()).toBeVisible();
    await expect(page.getByText('Rithy Sok')).toHaveCount(0); // assigned to trainer2
    await expectAccessible(page);

    const assigned = await apiFromPage<{ data: { student: { id: string; fullName: string } }[] }>(
      page,
      'GET',
      '/trainer/students?pageSize=100',
    );
    const srey = assigned.body.data.find((r) => r.student.fullName === 'Srey Neang')!;
    await page.goto(`/trainer/students/${srey.student.id}`);
    await expect(page.getByRole('heading', { name: 'Srey Neang' })).toBeVisible();
    await page.getByRole('link', { name: /^Reflections \(/ }).click();
    await expectAccessible(page);
    await logout(page);

    await login(page, 'trainer2');
    expect(
      (await apiFromPage(page, 'GET', `/trainer/students/${srey.student.id}/summary`)).status,
    ).toBe(404);
    await page.goto(`/trainer/students/${srey.student.id}`);
    await expect(page.getByText(/not be loaded|Page not found/)).toBeVisible();
  });
});

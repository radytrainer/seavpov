import { expect, test } from '@playwright/test';
import { expectAccessible, login, logout } from './helpers';

test.describe('authentication', () => {
  test('login page is accessible and rejects bad credentials', async ({ page }) => {
    await page.goto('/login');
    await expectAccessible(page);
    await page.getByLabel('Username, email or student ID').fill('student1');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Sign-in failed' })).toBeVisible();
  });

  test('student logs in, logs out and cannot reach protected pages afterwards', async ({
    page,
  }) => {
    await login(page, 'student1');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
    await logout(page);
    for (const path of ['/dashboard', '/books', '/reading']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
    const res = await page.request.get('/api/v1/auth/me');
    expect(res.status()).toBe(401);
  });

  test('each role lands on its own home page and cannot open other areas', async ({ page }) => {
    await login(page, 'trainer1');
    await expect(page).toHaveURL(/\/trainer$/);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/trainer$/);
    await logout(page);
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
  });
});

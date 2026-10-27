import { expect, test, type Page } from '@playwright/test';
import { apiFromPage, expectAccessible, login, logout } from './helpers';

async function setRegistration(page: Page, open: boolean) {
  await page.goto('/admin/settings');
  const toggle = page.getByRole('switch', { name: 'Allow students to register themselves' });
  if ((await toggle.getAttribute('aria-checked')) === String(open)) return;
  await toggle.click();
  await page
    .getByRole('button', { name: open ? 'Open registration' : 'Close registration' })
    .click();
  await expect(toggle).toHaveAttribute('aria-checked', String(open));
}

test.describe('student self-registration', () => {
  test('admin opens registration, a student registers, admin closes it again', async ({ page }) => {
    const suffix = Date.now().toString(36);
    await login(page, 'admin');
    await setRegistration(page, true);
    await logout(page);

    await page.goto('/login');
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expectAccessible(page);
    await page.getByLabel('Full name').fill(`ចាន់ សុភា ${suffix}`);
    await page.getByLabel('Student ID').fill(`REG-${suffix}`);
    await page.getByLabel('Class').selectOption({ label: 'Class A · Generation 2026' });
    await page.getByLabel('Password', { exact: true }).fill('Register2026x');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
    await logout(page);

    // The trainer of Class A sees the new student automatically.
    await login(page, 'trainer1');
    const students = await apiFromPage<{ data: { student: { username: string } }[] }>(
      page,
      'GET',
      `/trainer/students?search=REG-${suffix}`,
    );
    // Username is derived from the student ID.
    expect(students.body.data.map((r) => r.student.username)).toEqual([`reg-${suffix}`]);
    await logout(page);

    await login(page, 'admin');
    await setRegistration(page, false);
    await logout(page);
    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveCount(0);
    await page.goto('/register');
    await expect(page.getByText('Self-registration is closed')).toBeVisible();
  });
});

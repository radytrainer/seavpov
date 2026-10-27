import { expect, test } from '@playwright/test';
import { expectAccessible, login } from './helpers';

test.describe('admin users page', () => {
  test('find a student, open their reflections and download them as PDF', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users');
    await expect(page.getByRole('link', { name: /Active students/ })).toBeVisible();
    await expectAccessible(page);

    await page.getByPlaceholder('Name, student ID, username or email').fill('S2026-001');
    await page.getByRole('button', { name: 'Search' }).click();
    const row = page.getByRole('row', { name: /Srey Neang/ });
    await expect(row).toBeVisible();
    await expect(page.getByText('1 student ·')).toBeVisible();

    // Menu shortcuts go straight to the student's reflections.
    await row.getByRole('button', { name: /Actions for Srey Neang/ }).click();
    await page.getByRole('menuitem', { name: 'View reflections' }).click();
    await expect(page).toHaveURL(/\/admin\/students\/.+\?tab=reflections/);

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download all (PDF)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('reflections_s2026-001.pdf');

    // Single reflection PDF from a card.
    const single = page.waitForEvent('download');
    await page.getByRole('link', { name: 'PDF', exact: true }).first().click();
    expect((await single).suggestedFilename()).toMatch(/^reflection_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  test('trainers tab shows how many students each trainer has', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users?tab=trainers');
    await expect(page.getByRole('columnheader', { name: 'Students' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Sokha Chea/ })).toBeVisible();
  });
});

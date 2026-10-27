import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, login } from './helpers';

test.describe('mobile layout @mobile', () => {
  test('student pages fit the screen and use the bottom navigation', async ({ page }) => {
    await login(page, 'student1');
    for (const path of [
      '/dashboard',
      '/books',
      '/reading',
      '/history',
      '/reflections',
      '/analytics',
      '/profile',
    ]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Read' })).toBeVisible();

    // Dialog content must stay inside the viewport too.
    await page.goto('/books');
    await page.getByRole('button', { name: 'Add book' }).first().click();
    const add = page.getByRole('button', { name: 'Add', exact: true }).first();
    await expect(add).toBeVisible();
    const box = (await add.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});

import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const PASSWORD = process.env.E2E_PASSWORD ?? 'Password123!';

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Username, email or student ID').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  const signOut = page.getByRole('button', { name: 'Sign out' });
  if (!(await signOut.first().isVisible())) {
    // Mobile: the sign-out button lives in the menu sheet.
    await page.getByRole('button', { name: /More|Open menu/ }).click();
  }
  await signOut.first().click();
  await expect(page).toHaveURL(/\/login/);
}

export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Fails on serious/critical WCAG A/AA violations. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('nextjs-portal')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
}

/** API call from the browser context (shares the session cookie). */
export async function apiFromPage<T>(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const res = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          'x-requested-with': 'fetch',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as T };
    },
    { method, path, body },
  );
}

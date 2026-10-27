import { expect, test } from '@playwright/test';
import { apiFromPage, expectAccessible, login, logout } from './helpers';

test.describe('administrator and trainer workflows', () => {
  test('admin imports a valid CSV and sees clear errors for an invalid one', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin/users/import');
    await expectAccessible(page);
    const suffix = Date.now().toString(36);

    // Invalid file: bad email, duplicate student ID, unknown class.
    const invalid = [
      'student_id,full_name,username,email,gender,generation,class',
      `X${suffix}-1,Good Row,good${suffix},,,,`,
      `X${suffix}-1,Duplicate Id,dup${suffix},,,,`,
      `X${suffix}-2,Bad Email,bad${suffix},nope,,,`,
      `X${suffix}-3,No Class,nocls${suffix},,,Generation 2026,Class Q`,
    ].join('\n');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from(invalid) });
    await page.getByRole('button', { name: 'Check file' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Nothing was created' })).toBeVisible();
    const table = page.getByRole('table');
    await expect(table).toContainText('Duplicate of row 2');
    await expect(table).toContainText('Invalid email');
    await expect(table).toContainText('Class Q');

    // Valid file.
    const valid = [
      'student_id,full_name,username,email,gender,generation,class',
      `V${suffix}-1,Import One,imp1${suffix},,FEMALE,Generation 2026,Class A`,
      `V${suffix}-2,ណារី សុខ,imp2${suffix},,,Generation 2026,Class B`,
    ].join('\r\n');
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'good.csv', mimeType: 'text/csv', buffer: Buffer.from(valid) });
    await page.getByRole('button', { name: 'Check file' }).click();
    await page.getByRole('button', { name: 'Create 2 students' }).click();
    await expect(page.getByText('2 students created.')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download credentials' }).click();
    expect((await download).suggestedFilename()).toBe('student-credentials.csv');

    const found = await apiFromPage<{ meta: { total: number } }>(
      page,
      'GET',
      `/admin/users?search=${suffix}`,
    );
    expect(found.body.meta.total).toBe(2);
  });

  test('trainer reviews an assigned reflection and the student sees the feedback', async ({
    page,
  }) => {
    // student1 (assigned to trainer1 in the seed) records a manual session and reflects on it.
    await login(page, 'student1');
    const books = await apiFromPage<{ data: { id: string }[] }>(
      page,
      'GET',
      '/student-books?pageSize=1',
    );
    test.skip(books.body.data.length === 0, 'student1 needs a book');
    const now = Date.now();
    // A random 10-minute slot within the last two days avoids overlapping earlier runs.
    const slotStart = now - (1 + Math.floor(Math.random() * 280)) * 10 * 60_000;
    const session = await apiFromPage<{ data: { id: string } }>(
      page,
      'POST',
      '/reading-sessions/manual',
      {
        studentBookId: books.body.data[0]!.id,
        startedAt: new Date(slotStart).toISOString(),
        endedAt: new Date(slotStart + 10 * 60_000).toISOString(),
      },
    );
    test.skip(session.status !== 201, 'time slot overlapped an earlier run');
    const learned = `E2E learning ${now.toString(36)}`;
    const reflection = await apiFromPage<{ data: { id: string } }>(page, 'POST', '/reflections', {
      sessionId: session.body.data.id,
      learned,
    });
    expect(reflection.status).toBe(201);
    await logout(page);

    await login(page, 'trainer1');
    // The review queue shows reflections in full; feedback is given inline on the card.
    await page.goto('/trainer/reflections');
    const card = page.locator('article', { hasText: learned });
    await expect(card).toContainText('Srey Neang');
    await expect(card).toContainText('Needs feedback');
    const text = `Great work — keep going (${now.toString(36)})`;
    await card.getByLabel('Give feedback').fill(text);
    await card.getByRole('button', { name: 'Send feedback' }).click();
    // Answered reflections leave the "Needs feedback" queue…
    await expect(card).toHaveCount(0);
    // …and show the feedback on the student's Reflections tab.
    await page.goto('/trainer/students');
    await page.getByRole('link', { name: 'Srey Neang' }).first().click();
    await page.getByRole('link', { name: /^Reflections \(/ }).click();
    await expect(page.locator('article', { hasText: learned })).toContainText(text);
    await logout(page);

    await login(page, 'student1');
    await page.goto(`/reflections/${reflection.body.data.id}`);
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText('Sokha Chea')).toBeVisible();
  });
});

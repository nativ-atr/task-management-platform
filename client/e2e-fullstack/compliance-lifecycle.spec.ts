import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const users = {
  avery: '11111111-1111-4111-8111-111111111111',
  blake: '22222222-2222-4222-8222-222222222222',
};

test('completes a Compliance lifecycle against the real API and database', async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const caseOne = `CASE-${suffix}-1`;
  const caseTwo = `CASE-${suffix}-2`;
  const initialDocuments = `Initial document notes ${suffix}`;
  const replacementDocuments = `Replacement document notes ${suffix}`;
  const reviewNotes = `Reviewed ${suffix}`;
  const approvalReference = `APP-${suffix}`;

  await page.goto('/');
  await expect(page.getByText('Task filters')).toBeVisible();

  await page.getByRole('button', { name: /new task/i }).click();
  await page.getByLabel('Task type').selectOption('compliance');
  await page.getByLabel('Initial assignee').selectOption(users.avery);
  await page.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByRole('dialog', { name: 'New Task' })).toBeHidden();
  await expect(page.locator('.taskRow.selected')).toContainText('Compliance');
  await expect(page.locator('.taskRow.selected')).toContainText('OPEN');

  await page.getByRole('button', { name: /continue to intake completed/i }).click();
  let dialog = page.getByRole('dialog', { name: 'Intake completed' });
  await dialog.getByLabel('Next assignee').selectOption(users.blake);
  await dialog.getByRole('textbox', { name: 'Case reference' }).fill(caseOne);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to documents verified/i }).click();
  dialog = page.getByRole('dialog', { name: 'Documents verified' });
  await dialog.getByLabel('Next assignee').selectOption(users.avery);
  await dialog.getByRole('textbox', { name: 'Document notes' }).fill(initialDocuments);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /move back to intake completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Intake completed' });
  await expect(dialog.getByRole('textbox', { name: 'Case reference' })).toHaveValue(caseOne);
  await dialog.getByLabel('Next assignee').selectOption(users.avery);
  await dialog.getByRole('textbox', { name: 'Case reference' }).fill(caseTwo);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to documents verified/i }).click();
  dialog = page.getByRole('dialog', { name: 'Documents verified' });
  await expect(dialog.getByRole('textbox', { name: 'Document notes' })).toHaveValue(
    initialDocuments,
  );
  await dialog.getByLabel('Next assignee').selectOption(users.blake);
  await dialog.getByRole('textbox', { name: 'Document notes' }).fill(replacementDocuments);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to compliance review completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Compliance review completed' });
  await dialog.getByLabel('Next assignee').selectOption(users.avery);
  await dialog.getByRole('textbox', { name: 'Review notes' }).fill(reviewNotes);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  await page.getByRole('button', { name: /continue to approval completed/i }).click();
  dialog = page.getByRole('dialog', { name: 'Approval completed' });
  await dialog.getByLabel('Next assignee').selectOption(users.avery);
  await dialog.getByRole('textbox', { name: 'Approval reference' }).fill(approvalReference);
  await dialog.getByRole('button', { name: /^save$/i }).click();

  const dataPanel = page.getByRole('group', { name: 'Current task data groups' });
  await expect(page.getByRole('heading', { name: 'Current task data' })).toBeVisible();
  await expect(dataPanel).toContainText(caseTwo);
  await expect(dataPanel).toContainText(replacementDocuments);
  await expect(dataPanel).toContainText(reviewNotes);
  await expect(dataPanel).toContainText(approvalReference);
  await expect(dataPanel).not.toContainText(initialDocuments);
  const taskIdText = await page.locator('.detail .taskId').innerText();

  await page.setViewportSize({ width: 390, height: 820 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole('button', { name: 'Close task' }).click();
  await page.locator('label.segment').filter({ hasText: 'Closed' }).click();
  await page.locator('.taskRow').filter({ hasText: taskIdText }).click();
  await expect(page.locator('.detail')).toContainText(taskIdText);
  await expect(page.getByText('Read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close task' })).toBeHidden();
  await expect(dataPanel).toContainText(caseTwo);
  await expect(dataPanel).toContainText(replacementDocuments);
  await expect(dataPanel).toContainText(approvalReference);
  await expect(page.locator('.history')).toContainText('Task closed');
});

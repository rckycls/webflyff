// Logs in once for the run and keeps the session cookie for the other tests (an authenticator code works only once).

import { expect, test as setup } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USER, forgetSteps, freshCode, STATE } from './codes';

setup('log in to the demo panel', async ({ page }) => {
  forgetSteps();
  await page.goto('/');
  const form = page.locator('form.login');
  await expect(form).toBeVisible();
  await form.locator('input[name="user"]').fill(DEMO_USER);
  await form.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await form.locator('input[name="code"]').fill(await freshCode());
  await form.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.who')).toHaveText(DEMO_USER);
  await page.context().storageState({ path: STATE });
});

// The website's pages (website spec §3.1): home at /, sign-up at /sign-up, the game at /play, and a 404 page for the rest.

import { expect, test } from '@playwright/test';

test('home links to the game and to sign-up', async ({ page }) => {
  await page.route('**/api/status', (route) => route.fulfill({ json: { online: false, players: 0, checkedAt: '' } }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', '/play/');
  await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/sign-up/');
});

test('/play shows the lobby', async ({ page }) => {
  await page.goto('/play');
  await expect(page).toHaveURL(/\/play\/$/);
  // the game's page: its first compile in the dev server can take a while
  await expect(page.getByLabel('Account')).toBeVisible({ timeout: 20_000 });
});

test('/sign-up has its page', async ({ page }) => {
  await page.goto('/sign-up');
  await expect(page).toHaveURL(/\/sign-up\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('an unknown page is a 404 with a link home', async ({ page }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
});

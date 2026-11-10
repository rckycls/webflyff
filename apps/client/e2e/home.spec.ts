// The home page (website spec §3.2): the status from /api/status (mocked here), the news, the about section and the
// links, on a desktop, a landscape phone and an upright phone.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function statusAnswers(page: Page, body: unknown): Promise<void> {
  await page.route('**/api/status', (route) => route.fulfill({ json: body }));
}

test('shows the online count, the news and the links', async ({ page }) => {
  await statusAnswers(page, { online: true, players: 3, checkedAt: '2026-11-11T00:00:00.000Z' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Online · 3 players');
  await expect(page.getByRole('link', { name: 'Play', exact: true })).toHaveAttribute('href', '/play/');
  await expect(page.getByRole('link', { name: 'Sign up', exact: true })).toHaveAttribute('href', '/sign-up/');
  await expect(page.getByText('Closed Beta', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Closed beta' })).toBeVisible();
  await expect(page.locator('article time').first()).toHaveText('2026-11-11');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await expect(page.getByText('Screenshots coming soon')).toBeVisible();
  await expect(page.getByText('Windows and Mac browsers · Android phones and tablets · iPhone and iPad')).toBeVisible();
});

test('shows Offline', async ({ page }) => {
  await statusAnswers(page, { online: false, players: 0, checkedAt: '2026-11-11T00:00:00.000Z' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Offline');
});

test('shows Status unavailable when the service is down', async ({ page }) => {
  await page.route('**/api/status', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Status unavailable');
  await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('shows the page, not the turn-your-phone cover', async ({ page }) => {
    await statusAnswers(page, { online: true, players: 1, checkedAt: '2026-11-11T00:00:00.000Z' });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByText('Turn your device sideways')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Online · 1 player');
    const problems = await page.evaluate(() => {
      const found: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push('the page scrolls sideways');
      for (const element of document.querySelectorAll<HTMLElement>('#site *')) {
        const text = [...element.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
        if (text && parseFloat(getComputedStyle(element).fontSize) < 14) found.push(`${element.tagName} "${element.textContent}" is under 14px`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });
});

// The home page (website spec §3.2): the status from /api/status (mocked here), the news, the about section and the
// links, on a desktop, a landscape phone and an upright phone.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function statusAnswers(page: Page, body: unknown): Promise<void> {
  await page.route('**/api/status', (route) => route.fulfill({ json: body }));
}

const DISCORD = { url: 'https://discord.gg/abc', name: 'OSFlyff', online: 42, members: 310 };
async function discordAnswers(page: Page, status: number, body: unknown): Promise<void> {
  await page.route('**/api/discord', (route) => route.fulfill({ status, json: body }));
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

// The owner's design (2026-11-11): the game's art over the whole page, minimal; Play stands out, Sign up stays quiet.
test('the art fills the page; Play stands out and Sign up stays quiet', async ({ page }) => {
  await statusAnswers(page, { online: true, players: 3, checkedAt: '2026-11-11T00:00:00.000Z' });
  await page.goto('/');
  // the art comes after the page, with the 2 MB asset index: slow on a busy machine's first read
  await expect(page.locator('html')).toHaveClass(/has-art/, { timeout: 20_000 });
  const art = await page.evaluate(() => {
    const layer = getComputedStyle(document.body, '::before');
    return { image: layer.backgroundImage, position: layer.position, width: parseFloat(layer.width), height: parseFloat(layer.height) };
  });
  expect(art.image).toContain('screen.');
  expect(art.position).toBe('fixed');
  expect(art.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  expect(art.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  const play = (await page.getByRole('link', { name: 'Play', exact: true }).boundingBox())!;
  const signUp = (await page.getByRole('link', { name: 'Sign up', exact: true }).boundingBox())!;
  expect(play.width * play.height).toBeGreaterThan(2 * signUp.width * signUp.height);
  // Play is on the first screen
  expect(play.y + play.height).toBeLessThanOrEqual(page.viewportSize()!.height);
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
    await discordAnswers(page, 200, DISCORD);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByText('42 online · 310 members')).toBeVisible();
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

// The Discord button (docs/superpowers/specs/2026-11-20-discord-box-design.md): from /api/discord, on the first screen.
test('shows the Discord button with the live numbers', async ({ page }) => {
  await statusAnswers(page, { online: true, players: 3, checkedAt: '2026-11-11T00:00:00.000Z' });
  await discordAnswers(page, 200, DISCORD);
  await page.goto('/');
  const button = page.getByRole('link', { name: /Join our Discord/ });
  await expect(button).toHaveAttribute('href', 'https://discord.gg/abc');
  await expect(button).toHaveAttribute('target', '_blank');
  await expect(button).toHaveAttribute('rel', /noopener/);
  await expect(button).toContainText('42 online · 310 members');
  const box = (await button.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  // Play still stands out
  const play = (await page.getByRole('link', { name: 'Play', exact: true }).boundingBox())!;
  expect(play.width * play.height).toBeGreaterThan(box.width * box.height);
});

test('shows the button without numbers when Discord gave none', async ({ page }) => {
  await statusAnswers(page, { online: true, players: 3, checkedAt: '2026-11-11T00:00:00.000Z' });
  await discordAnswers(page, 200, { ...DISCORD, online: null, members: null });
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Join our Discord/ })).toHaveText('Join our Discord');
});

test('shows no Discord button when it is off or the answer is bad', async ({ page }) => {
  await statusAnswers(page, { online: true, players: 3, checkedAt: '2026-11-11T00:00:00.000Z' });
  await discordAnswers(page, 404, { error: 'off' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Online · 3 players');
  await expect(page.getByRole('link', { name: /Discord/ })).toHaveCount(0);
  await page.unroute('**/api/discord');
  await discordAnswers(page, 200, { ...DISCORD, url: 'https://evil.example/x' });
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Online · 3 players');
  await expect(page.getByRole('link', { name: /Discord/ })).toHaveCount(0);
});

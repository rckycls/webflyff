// The sign-up page (website spec §3.3) against a mocked web service that keeps the real one's ticket rules (a ticket
// is good from 3 s after it was given, and once): the rules checked first, each answer's message, a second press while
// sending, a press at once after the page opened, an old ticket renewed and sent again, the trap field, and the new name
// handed to the game's login at /play.

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/** The page waits until its ticket is 3 s old before it sends: what follows a press can take that long. */
const afterSend = expect.configure({ timeout: 10_000 });

interface Mock { tickets: number; posts: Record<string, unknown>[]; early: number }
type Answer = { status: number; body: unknown; delayMs?: number };

/**
 * The ticket answers t1, t2, ...; a sign-up POST is recorded, refused with `ticket` as the service does when its ticket
 * is under 3 s old (`early`, counted) or used, and otherwise answered by `answer` (by the POST's number, from 1).
 */
async function mockService(page: Page, answer: (n: number) => Answer): Promise<Mock> {
  const mock: Mock = { tickets: 0, posts: [], early: 0 };
  const givenAt = new Map<string, number>();
  const used = new Set<string>();
  await page.route('**/api/sign-up/ticket', (route) => {
    mock.tickets += 1;
    givenAt.set(`t${mock.tickets}`, Date.now());
    return route.fulfill({ json: { ticket: `t${mock.tickets}` } });
  });
  await page.route('**/api/sign-up', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.posts.push(body);
    const ticket = String(body.ticket);
    if (Date.now() - (givenAt.get(ticket) ?? Infinity) < 3000) mock.early += 1;
    if (Date.now() - (givenAt.get(ticket) ?? Infinity) < 3000 || used.has(ticket)) {
      await route.fulfill({ status: 400, json: { error: 'ticket' } });
      return;
    }
    used.add(ticket);
    const { status, body: reply, delayMs = 0 } = answer(mock.posts.length);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status, json: reply });
  });
  return mock;
}

async function fill(page: Page, account: string, password = 'abc12345', confirm = password): Promise<void> {
  await page.getByLabel('Account', { exact: true }).fill(account);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(confirm);
}

const signUp = (page: Page) => page.getByRole('button', { name: 'Sign up' });

test('success hands the name to the game', async ({ page }) => {
  const mock = await mockService(page, () => ({ status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await expect.poll(() => mock.tickets).toBe(1);
  await fill(page, ' Hero_01 ');
  await signUp(page).click();
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts).toEqual([{ account: 'hero_01', password: 'abc12345', email: '', website: '', ticket: 't1' }]);
  await page.getByRole('link', { name: 'Play now' }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  // the game's page: its first compile in the dev server can take a while
  await expect(page.getByLabel('Account')).toHaveValue('hero_01', { timeout: 20_000 });
  // the name is handed over once: a reload of /play does not fill it again
  await page.reload();
  await expect(page.getByLabel('Account')).toHaveValue('', { timeout: 20_000 });
});

test('a press at once after the page opens waits until the ticket is good', async ({ page }) => {
  const mock = await mockService(page, () => ({ status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await fill(page, 'hero_01');
  await signUp(page).click();
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts).toHaveLength(1);
  expect(mock.early).toBe(0);
});

test('shows each refusal, keeping the fields but the passwords', async ({ page }) => {
  test.setTimeout(60_000);
  const answers = [
    { status: 409, body: { error: 'taken' }, text: 'That account name is taken.' },
    { status: 429, body: { error: 'too_many' }, text: 'Too many sign-ups from your network. Try again later.' },
    { status: 429, body: { error: 'paused' }, text: 'Sign-ups are paused for a few minutes. Try again soon.' },
    { status: 500, body: { error: 'server' }, text: 'Something went wrong. Please try again later.' },
    { status: 400, body: { error: 'invalid', field: 'email' }, text: 'Enter a valid email address, or leave it empty.' },
  ];
  const mock = await mockService(page, (n) => answers[n - 1]!);
  await page.goto('/sign-up/');
  for (const { text } of answers) {
    await fill(page, 'hero_01');
    await page.getByLabel('Email (optional)').fill('a@b.cd');
    await signUp(page).click();
    await afterSend(page.getByText(text)).toBeVisible();
    await expect(page.getByLabel('Account', { exact: true })).toHaveValue('hero_01');
    await expect(page.getByLabel('Email (optional)')).toHaveValue('a@b.cd');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('');
  }
  // each refusal spent its ticket, and each send waited for a new one to be good
  expect(mock.posts.map((post) => post.ticket)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  expect(mock.early).toBe(0);
});

test('checks the rules before sending', async ({ page }) => {
  const mock = await mockService(page, () => ({ status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await fill(page, 'abc');
  await signUp(page).click();
  await expect(page.getByText('The account name must be 4 to 32 characters long.')).toBeVisible();
  await expect(page.getByLabel('Account', { exact: true })).toBeFocused();
  await fill(page, 'hero_01', 'abc12345', 'abc12346');
  await signUp(page).click();
  await expect(page.getByText('The passwords do not match.')).toBeVisible();
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeFocused();
  expect(mock.posts).toEqual([]);
});

test('a second press while sending does nothing', async ({ page }) => {
  const mock = await mockService(page, () => ({ status: 201, body: { ok: true }, delayMs: 1000 }));
  await page.goto('/sign-up/');
  await fill(page, 'hero_01');
  await signUp(page).click();
  await expect(signUp(page)).toBeDisabled();
  // a second submit (Enter, or a tap that got past the disabled button)
  await page.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts).toHaveLength(1);
  await expect(page.getByText('That account name is taken.')).toHaveCount(0);
});

test('an old ticket is renewed and the form sent again by itself', async ({ page }) => {
  // the first POST's ticket is too old (a page left open over 30 minutes)
  const mock = await mockService(page, (n) => (n === 1 ? { status: 400, body: { error: 'ticket' } } : { status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await fill(page, 'hero_01');
  await signUp(page).click();
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.tickets).toBe(2);
  expect(mock.posts.map((post) => post.ticket)).toEqual(['t1', 't2']);
  expect(mock.early).toBe(0);
});

test('a ticket refused twice asks for one more press, with every field kept', async ({ page }) => {
  const mock = await mockService(page, (n) => (n <= 2 ? { status: 400, body: { error: 'ticket' } } : { status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await fill(page, 'hero_01');
  await signUp(page).click();
  await afterSend(page.getByText('Please press Sign up again.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue('hero_01');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('abc12345');
  await expect(signUp(page)).toBeEnabled();
  await signUp(page).click();
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts.map((post) => post.ticket)).toEqual(['t1', 't2', 't3']);
  expect(mock.early).toBe(0);
});

test('the trap field is off screen, out of the tab order, and named so that no form filler fills it', async ({ page }) => {
  const mock = await mockService(page, () => ({ status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  const trap = page.locator('.trap input');
  await expect(trap).toHaveCount(1);
  await expect(trap).toHaveAttribute('tabindex', '-1');
  await expect(trap).toHaveAttribute('autocomplete', 'off');
  await expect(page.locator('.trap')).toHaveAttribute('aria-hidden', 'true');
  expect(await trap.evaluate((input) => input.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  // nothing a password or identity manager matches: no website, url, homepage, name, email or company
  const words = await trap.evaluate((input: HTMLInputElement) =>
    [input.name, input.id, input.labels?.[0]?.textContent ?? '', input.placeholder].join(' ').toLowerCase());
  expect(words).not.toMatch(/web|site|url|home|name|mail|company|address|phone/);
  // the service still gets it as `website`
  await fill(page, 'hero_01');
  await signUp(page).click();
  await afterSend(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts[0]).toMatchObject({ website: '' });
});

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the form fits, its inputs are 16 px and its text 14 px or more', async ({ page }) => {
    await mockService(page, () => ({ status: 201, body: { ok: true } }));
    await page.goto('/sign-up/');
    await expect(signUp(page)).toBeVisible();
    await expect(page.getByText('Turn your device sideways')).toHaveCount(0);
    const problems = await page.evaluate(() => {
      const found: string[] = [];
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth) found.push('the page scrolls sideways');
      for (const input of document.querySelectorAll<HTMLInputElement>('input')) {
        if (input.closest('.trap') === null && parseFloat(getComputedStyle(input).fontSize) < 16) found.push(`input ${input.name} is under 16px`);
      }
      for (const element of document.querySelectorAll<HTMLElement>('#site *')) {
        const text = [...element.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
        if (text && parseFloat(getComputedStyle(element).fontSize) < 14) found.push(`${element.tagName} "${element.textContent}" is under 14px`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });
});

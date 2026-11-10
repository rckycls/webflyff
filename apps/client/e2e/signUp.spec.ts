// The sign-up page (website spec §3.3) against a mocked web service: the rules checked first, each answer's message, a
// second press while sending, an old ticket renewed, and the new name handed to the game's login at /play.

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

interface Mock { tickets: number; posts: unknown[] }

/** The ticket answers t1, t2, ...; each sign-up POST is recorded and answered by `answer` (by its number, from 1). */
async function mockService(page: Page, answer: (n: number) => { status: number; body: unknown; delayMs?: number }): Promise<Mock> {
  const mock: Mock = { tickets: 0, posts: [] };
  await page.route('**/api/sign-up/ticket', (route) => {
    mock.tickets += 1;
    return route.fulfill({ json: { ticket: `t${mock.tickets}` } });
  });
  await page.route('**/api/sign-up', async (route: Route) => {
    mock.posts.push(route.request().postDataJSON());
    const { status, body, delayMs = 0 } = answer(mock.posts.length);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status, json: body });
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
  await expect(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts).toEqual([{ account: 'hero_01', password: 'abc12345', email: '', website: '', ticket: 't1' }]);
  await page.getByRole('link', { name: 'Play now' }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  await expect(page.getByLabel('Account')).toHaveValue('hero_01');
  // the name is handed over once: a reload of /play does not fill it again
  await page.reload();
  await expect(page.getByLabel('Account')).toHaveValue('');
});

test('shows each refusal, keeping the fields but the passwords', async ({ page }) => {
  const answers = [
    { status: 409, body: { error: 'taken' }, text: 'That account name is taken.' },
    { status: 429, body: { error: 'too_many' }, text: 'Too many sign-ups from your network. Try again later.' },
    { status: 429, body: { error: 'paused' }, text: 'Sign-ups are paused for a few minutes. Try again soon.' },
    { status: 500, body: { error: 'server' }, text: 'Something went wrong. Please try again later.' },
    { status: 400, body: { error: 'invalid', field: 'email' }, text: 'Enter a valid email address, or leave it empty.' },
  ];
  await mockService(page, (n) => answers[n - 1]!);
  await page.goto('/sign-up/');
  for (const { text } of answers) {
    await fill(page, 'hero_01');
    await page.getByLabel('Email (optional)').fill('a@b.cd');
    await signUp(page).click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByLabel('Account', { exact: true })).toHaveValue('hero_01');
    await expect(page.getByLabel('Email (optional)')).toHaveValue('a@b.cd');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('');
  }
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
  await expect(page.getByText('Account created.')).toBeVisible();
  expect(mock.posts).toHaveLength(1);
  await expect(page.getByText('That account name is taken.')).toHaveCount(0);
});

test('an old ticket is renewed and the fields kept', async ({ page }) => {
  const mock = await mockService(page, (n) => (n === 1 ? { status: 400, body: { error: 'ticket' } } : { status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  await fill(page, 'hero_01');
  await signUp(page).click();
  await expect(page.getByText('Please press Sign up again.')).toBeVisible();
  await expect.poll(() => mock.tickets).toBe(2);
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue('hero_01');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('abc12345');
  await signUp(page).click();
  await expect(page.getByText('Account created.')).toBeVisible();
  expect((mock.posts[1] as { ticket: string }).ticket).toBe('t2');
});

test('the trap field is off screen and out of the tab order', async ({ page }) => {
  await mockService(page, () => ({ status: 201, body: { ok: true } }));
  await page.goto('/sign-up/');
  const trap = page.locator('input[name="website"]');
  await expect(trap).toHaveAttribute('tabindex', '-1');
  await expect(trap).toHaveAttribute('autocomplete', 'off');
  await expect(page.locator('.trap')).toHaveAttribute('aria-hidden', 'true');
  expect(await trap.evaluate((input) => input.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
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

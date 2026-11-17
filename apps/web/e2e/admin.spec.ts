// The admin panel's page against the demo server (made-up data in memory), logged in by login.setup.ts.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_USER, freshCode } from './codes';

const section = (page: Page, name: string) => page.locator(`section[aria-label="${name}"]`);

/** Picks a tab; on a narrow screen the tabs are in the sidebar, which the menu button slides in first. */
async function openTab(page: Page, name: string) {
  const menu = page.locator('.menu');
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.locator('body')).toHaveClass(/menu-open/);
  }
  await page.locator('.tabs').getByRole('button', { name, exact: true }).click();
  await expect(section(page, name)).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
}

test('on a narrow screen the menu button slides the sidebar in and out', async ({ page }) => {
  const menu = page.locator('.menu');
  test.skip(!(await menu.isVisible()), 'a wide screen shows the sidebar all the time');
  await menu.click();
  // the first tab shows at once; since the VIP tab, Log is below the fold of a phone held sideways: the sidebar scrolls
  await expect(page.locator('.tabs').getByRole('button', { name: 'Status', exact: true })).toBeInViewport();
  const log = page.locator('.tabs').getByRole('button', { name: 'Log', exact: true });
  await log.scrollIntoViewIfNeeded();
  await expect(log).toBeInViewport();
  // a tap beside the sidebar, on the dimmed page, closes it
  const width = page.viewportSize()!.width;
  await page.mouse.click(width - 10, 200);
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
});

/** `yyyy-mm-dd` `days` from today, in the browser's time. */
function dayInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.beforeEach(async ({ page }) => {
  // nothing on the page may ever run a dialog it was not asked to (an injected script would)
  page.on('dialog', (dialog) => { throw new Error(`unexpected dialog: ${dialog.message()}`); });
  await page.goto('/');
  await expect(page.locator('.who')).toHaveText(DEMO_USER);
});

test('shows the 7 game servers on the Status tab', async ({ page }) => {
  const status = section(page, 'Status');
  for (const name of ['Account', 'Certifier', 'Database', 'Core', 'Login', 'Cache', 'World']) {
    await expect(status.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await expect(status.locator('.lock')).toHaveText(/character edits open/);
});

test('finds POREOTIX, bans it until a later day, and the log has the row', async ({ page }) => {
  await openTab(page, 'Accounts');
  const accounts = section(page, 'Accounts');
  await accounts.getByPlaceholder('Account, email or character name').fill('POREOTIX');
  await accounts.getByRole('button', { name: 'Find', exact: true }).click();
  await accounts.getByRole('cell', { name: 'Poreotix', exact: true }).click();
  const until = dayInput(3);
  await accounts.locator('input[type="date"]').fill(until);
  await accounts.getByPlaceholder('reason (kept in the log)').fill('e2e check');
  await accounts.getByRole('button', { name: 'Ban', exact: true }).click();
  await expect(accounts.locator('dd.ban')).toHaveText(`Banned until ${until}`);
  await openTab(page, 'Log');
  await expect(section(page, 'Log').getByRole('cell', { name: 'accounts.ban', exact: true }).first()).toBeVisible();
});

test('shows an email that looks like HTML as plain text', async ({ page }) => {
  await openTab(page, 'Accounts');
  const accounts = section(page, 'Accounts');
  await accounts.getByPlaceholder('Account, email or character name').fill('tester1');
  await accounts.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(accounts.getByRole('cell', { name: '<img src=x onerror=alert(1)>', exact: true })).toBeVisible();
  await accounts.getByRole('cell', { name: 'tester1', exact: true }).click();
  await expect(accounts.locator('dl.facts')).toContainText('<img src=x onerror=alert(1)>');
  // no picture made from the email (the VIP tab's own receipt and QR pictures are elsewhere on the page)
  await expect(accounts.locator('img')).toHaveCount(0);
});

test('a double click on Send item sends once', async ({ page }) => {
  await openTab(page, 'Send');
  const send = section(page, 'Send');
  await send.getByPlaceholder('Character name').fill('Alt');
  await send.getByRole('button', { name: 'Find', exact: true }).click();
  await send.getByRole('button', { name: /^Alt — tester1/ }).click();
  const rows = send.getByRole('row').filter({ hasText: 'Vagrant Cap' });
  await expect(send.getByText('Sends not yet delivered')).toBeVisible();
  await page.waitForTimeout(300);
  const before = await rows.count();
  await send.getByPlaceholder('Item name or id').fill('cap');
  await send.getByRole('button', { name: 'Vagrant Cap (id 500)' }).click();
  await send.getByRole('button', { name: 'Send item', exact: true }).dblclick();
  await expect(send.locator('.message.ok')).toHaveText(/Sent 1 × Vagrant Cap to Alt/);
  await expect(rows).toHaveCount(before + 1);
});

test('a send whose answer is lost says it may have been made, and shows the pending list', async ({ page }) => {
  await openTab(page, 'Send');
  const send = section(page, 'Send');
  await send.getByPlaceholder('Character name').fill('Hero');
  await send.getByRole('button', { name: 'Find', exact: true }).click();
  await send.getByRole('button', { name: /^Hero — Poreotix/ }).click();
  const rows = send.getByRole('row').filter({ hasText: 'Wooden Sword' });
  await expect(send.getByText('Sends not yet delivered')).toBeVisible();
  await page.waitForTimeout(300);
  const before = await rows.count();
  // the request reaches the panel and is done; the answer never comes back
  await page.route('**/api/sends.item', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await send.getByPlaceholder('Item name or id').fill('sword');
  await send.getByRole('button', { name: 'Wooden Sword (id 21)' }).click();
  await send.getByRole('button', { name: 'Send item', exact: true }).click();
  await expect(send.locator('.message.problem')).toHaveText(/may have been made/);
  await expect(rows).toHaveCount(before + 1);
});

test('a lost session shows the login box and keeps what was typed', async ({ page, context }) => {
  await openTab(page, 'Accounts');
  const accounts = section(page, 'Accounts');
  const query = accounts.getByPlaceholder('Account, email or character name');
  await query.fill('tester');
  await context.clearCookies();
  await accounts.getByRole('button', { name: 'Find', exact: true }).click();
  const form = page.locator('form.login');
  await expect(form).toBeVisible();
  await form.locator('input[name="user"]').fill(DEMO_USER);
  await form.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await form.locator('input[name="code"]').fill(await freshCode());
  await form.getByRole('button', { name: 'Log in' }).click();
  await expect(form).toBeHidden();
  await expect(query).toHaveValue('tester');
});

test('2026-11-17: the account list opens at once, 10 a page; a page seen before needs no new read; Refresh reads it again', async ({ page }) => {
  const reads: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('/api/accounts.page')) reads.push(request.postData() ?? ''); });
  await openTab(page, 'Accounts');
  const accounts = section(page, 'Accounts');
  await expect(accounts.locator('.list-info')).toHaveText(/^Showing 1-10 of 33 · read at /);
  await expect(accounts.getByRole('cell', { name: 'player01', exact: true })).toBeVisible();
  await accounts.getByRole('button', { name: 'Page 2', exact: true }).click();
  await expect(accounts.locator('.list-info')).toHaveText(/^Showing 11-20 of 33/);
  await expect(accounts.getByRole('cell', { name: 'player11', exact: true })).toBeVisible();
  const afterTwo = reads.length;
  // back to page 1, and to another tab and back: no new read
  await accounts.getByRole('button', { name: 'Page 1', exact: true }).click();
  await expect(accounts.getByRole('cell', { name: 'player01', exact: true })).toBeVisible();
  await openTab(page, 'Status');
  await openTab(page, 'Accounts');
  await expect(accounts.getByRole('cell', { name: 'player01', exact: true })).toBeVisible();
  expect(reads.length).toBe(afterTwo);
  await accounts.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => reads.length).toBe(afterTwo + 1);
  expect(JSON.parse(reads.at(-1)!)).toMatchObject({ page: 1, fresh: true });
  // the search filters the same list
  await accounts.getByPlaceholder('Account, email or character name').fill('player2');
  await accounts.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(accounts.locator('.list-info')).toHaveText(/^Showing 1-10 of 10 /);
});

test('2026-11-17: sets a character\'s own level and an account\'s VIP level, each in the log', async ({ page }) => {
  page.removeAllListeners('dialog');
  page.on('dialog', (dialog) => { void dialog.accept(); });
  await openTab(page, 'Characters');
  const characters = section(page, 'Characters');
  await characters.getByPlaceholder('Character name or account').fill('Walker05');
  await characters.getByRole('button', { name: 'Find', exact: true }).click();
  await characters.getByRole('cell', { name: 'Walker05', exact: true }).click();
  await characters.locator('label', { hasText: 'Own level' }).locator('select').selectOption('B');
  await characters.getByRole('button', { name: 'Set character level', exact: true }).click();
  await expect(characters.locator('dd.level')).toHaveText('VIP 2 (B)');
  await expect(characters.locator('dd.plays-as')).toHaveText('VIP 2 (B)');
  // the list row shows it too (the edit dropped that page)
  await expect(characters.getByRole('row').filter({ hasText: 'Walker05' }).first()).toContainText('VIP 2 (B)');

  await characters.getByRole('link', { name: 'player05', exact: true }).click();
  const accounts = section(page, 'Accounts');
  await expect(accounts.getByRole('heading', { name: 'player05', exact: true })).toBeVisible();
  await accounts.locator('label', { hasText: 'Account level' }).locator('select').selectOption('E');
  await accounts.getByLabel('Also its characters').uncheck();
  await accounts.getByRole('button', { name: 'Set account level', exact: true }).click();
  await expect(accounts.locator('dd.level')).toHaveText('VIP 4 (E)');
  await expect(accounts.getByRole('row').filter({ hasText: 'Walker05' })).toContainText('VIP 2 (B)');

  await openTab(page, 'Log');
  const log = section(page, 'Log');
  await expect(log.getByRole('cell', { name: 'characters.authority', exact: true }).first()).toBeVisible();
  await expect(log.getByRole('cell', { name: 'accounts.authority', exact: true }).first()).toBeVisible();
});

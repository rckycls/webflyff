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
  await expect(page.locator('.tabs').getByRole('button', { name: 'Log', exact: true })).toBeInViewport();
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

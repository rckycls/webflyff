// The panel's VIP tab (Support / VIP, 2026-11-16) against the demo server, logged in by login.setup.ts. Each test makes
// its own request through the demo's site API (as a player would from /vip/), so the desktop and phone runs never wait
// on each other's rows: approve (VIP for a month, in the Log tab), reject with a reason, the payment QRs and the tiers.

import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { ADMIN_E2E_PORT, SITE_E2E_ORIGIN } from '../playwright.config';

const SITE = `http://127.0.0.1:${ADMIN_E2E_PORT - 1}`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const section = (page: Page) => page.locator('section[aria-label="VIP"]');

/** Picks a tab; on a narrow screen the tabs are in the sidebar, which the menu button slides in first. */
async function openTab(page: Page, name: string) {
  const menu = page.locator('.menu');
  if (await menu.isVisible()) {
    await menu.click();
    await expect(page.locator('body')).toHaveClass(/menu-open/);
  }
  await page.locator('.tabs').getByRole('button', { name, exact: true }).click();
  await expect(page.locator(`section[aria-label="${name}"]`)).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/menu-open/);
}

/** A player (one of the demo's e2e players, by chance) sends a request for `tier`: its id, account and reference. */
async function playerSends(request: APIRequestContext, tier: number, currency = 'USD'): Promise<{ id: number; account: string; reference: string }> {
  const account = `e2e${1 + Math.floor(Math.random() * 6)}`;
  const login = await request.post(`${SITE}/api/account/login`, { headers: { Origin: SITE_E2E_ORIGIN }, data: { account, password: 'demo-password-e2e' } });
  expect(login.status()).toBe(200);
  const cookie = String(login.headers()['set-cookie']).split(';')[0]!;
  const { csrf } = await login.json() as { csrf: string };
  const reference = `E2E-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const sent = await request.post(`${SITE}/api/vip/requests`, {
    headers: { Origin: SITE_E2E_ORIGIN, Cookie: cookie, 'X-Site-Token': csrf },
    data: { tier, currency, reference, receipt: PNG, requestId: reference },
  });
  expect(sent.status()).toBe(201);
  return { id: ((await sent.json()) as { id: number }).id, account, reference };
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => { throw new Error(`unexpected dialog: ${dialog.message()}`); });
  await page.goto('/');
  await expect(page.locator('.who')).toHaveText('Poreotix');
});

test('approves a request after asking once more: VIP for one month, and the Log tab has the row', async ({ page, request }) => {
  const sent = await playerSends(request, 2);
  await openTab(page, 'VIP');
  const card = section(page).locator(`article[data-request="${sent.id}"]`);
  await expect(card).toContainText(sent.account);
  await expect(card).toContainText(sent.reference);
  await expect(card).toContainText('VIP 2 · $4 / month');
  await expect.poll(() => card.locator('img').evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth)).toBe(1);
  await card.getByRole('button', { name: 'Approve' }).click();
  await card.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(section(page).locator('.message.ok').first()).toContainText(`Approved: ${sent.account} has VIP 2 until`);
  await expect(card).toHaveCount(0);
  await section(page).getByRole('button', { name: 'Approved', exact: true }).click();
  await expect(section(page).locator(`article[data-request="${sent.id}"]`)).toContainText('Approved by Poreotix');

  await openTab(page, 'Log');
  const log = page.locator('section[aria-label="Log"]');
  await log.getByPlaceholder('Account').fill(sent.account);
  await log.locator('select').selectOption('vip.approve');
  await log.getByRole('button', { name: 'Show' }).click();
  await expect(log.getByRole('cell', { name: 'vip.approve', exact: true }).first()).toBeVisible();
});

test('rejects a request only with a reason, which the player then sees', async ({ page, request }) => {
  // a player in the Philippines: the card shows the peso price they were asked to pay
  const sent = await playerSends(request, 4, 'PHP');
  await openTab(page, 'VIP');
  const card = section(page).locator(`article[data-request="${sent.id}"]`);
  await expect(card).toContainText('VIP 4 · ₱575 / month');
  await card.getByRole('button', { name: 'Reject' }).click();
  await card.locator('.vip-ask').getByRole('button', { name: 'Reject' }).click();
  await expect(card.locator('.message.problem')).toHaveText('Write the reason the player will see.');
  await card.getByPlaceholder('Reason the player will see').fill('No payment with this reference came in.');
  await card.locator('.vip-ask').getByRole('button', { name: 'Reject' }).click();
  await expect(section(page).locator('.message.ok').first()).toContainText(`Rejected request ${sent.id}`);
  await section(page).getByRole('button', { name: 'Rejected', exact: true }).click();
  await expect(section(page).locator(`article[data-request="${sent.id}"]`)).toContainText('No payment with this reference came in.');
});

test('adds a payment QR players see, hides it, and deletes it', async ({ page, request }) => {
  await openTab(page, 'VIP');
  await section(page).getByRole('button', { name: 'Payment QRs' }).click();
  const label = `Maya ${Date.now() % 100000}`;
  const form = section(page).locator('form.card');
  await form.getByLabel('Label').fill(label);
  await form.getByLabel('Account name').fill('R. C.');
  await form.getByLabel(/QR picture/).setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
  await form.getByRole('button', { name: 'Add QR' }).click();
  await expect(form.locator('.message.ok')).toHaveText('QR added.');
  const card = section(page).locator('article[data-qr]', { hasText: label });
  await expect(card).toContainText('shown to players');
  const shown = async () => ((await (await request.get(`${SITE}/api/vip`)).json()) as { qrs: { label: string }[] }).qrs.map((q) => q.label);
  expect(await shown()).toContain(label);

  await card.getByText('Show to players').click();
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(section(page).locator('article[data-qr]', { hasText: label })).toContainText('off');
  expect(await shown()).not.toContain(label);

  const again = section(page).locator('article[data-qr]', { hasText: label });
  await again.getByRole('button', { name: 'Delete' }).click();
  await again.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(section(page).locator('article[data-qr]', { hasText: label })).toHaveCount(0);
});

test('changes a tier\'s dollar and peso prices that players then see, and puts them back', async ({ page, request }) => {
  await openTab(page, 'VIP');
  await section(page).getByRole('button', { name: 'Tiers', exact: true }).click();
  const price = section(page).getByLabel('US$ price of level 1');
  const pricePhp = section(page).getByLabel('Peso price of level 1');
  await expect(pricePhp).toHaveValue('115.00');
  const pricesOnSite = async () => {
    const tier = ((await (await request.get(`${SITE}/api/vip`)).json()) as { tiers: { priceCents: number; pricePhpCents: number | null }[] }).tiers[0]!;
    return [tier.priceCents, tier.pricePhpCents];
  };
  const save = section(page).getByRole('button', { name: 'Save level 1' });
  await price.fill('2.50');
  await pricePhp.fill('');
  await save.click();
  await expect(section(page).locator('.vip-view:not([hidden]) .message.ok')).toHaveText('Saved level 1.');
  expect(await pricesOnSite()).toEqual([250, null]);
  await price.fill('2');
  await pricePhp.fill('115');
  await save.click();
  await expect.poll(pricesOnSite).toEqual([200, 11500]);
});

test('2026-11-20: makes an everyone code with a word, lists it, and turns it off', async ({ page }, info) => {
  await openTab(page, 'VIP');
  await section(page).getByRole('button', { name: 'Codes', exact: true }).click();
  const view = section(page).locator('.vip-view:not([hidden])');
  const word = `E2E${info.project.name.replace(/\W/g, '').toUpperCase().slice(0, 6)}${Date.now() % 100000}`;
  await view.getByLabel('Code name').fill(`E2E ${word}`);
  await view.getByLabel('VIP level').selectOption('1');
  await view.getByLabel('VIP days').fill('3');
  await view.getByLabel('Your own word').fill(word);
  await view.getByRole('button', { name: 'Make', exact: true }).click();
  await expect(view.getByText(`Made the code ${word}.`)).toBeVisible();
  const card = view.locator('.card').filter({ hasText: `E2E ${word} · On` });
  await expect(card).toContainText('VIP 1 for 3 days');
  await card.getByRole('button', { name: 'Turn off' }).click();
  await expect(view.locator('.card').filter({ hasText: `E2E ${word} · Off` })).toBeVisible();
});

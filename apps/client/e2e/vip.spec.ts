// The Support / VIP page (2026-11-16) against a mocked web service that keeps the real one's rules for what it checks
// here: the tiers and QRs for everyone, the game-account login, a request with its receipt (Processing), the answers'
// messages, and Approved / Rejected requests with the VIP's end date or the admin's reason. On a desktop and a phone.
// Prices: US$ in New York, pesos in Manila (the browser's time zone and language), and the switch between them.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// a player outside the Philippines, whatever the machine running the tests says
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

/** A real 1 x 1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const TIERS = [
  { level: 1, name: 'VIP 1', priceCents: 200, pricePhpCents: 11500 }, { level: 2, name: 'VIP 2', priceCents: 400, pricePhpCents: 23000 },
  { level: 3, name: 'VIP 3', priceCents: 600, pricePhpCents: 34500 }, { level: 4, name: 'VIP 4', priceCents: 1000, pricePhpCents: 57500 },
];
const QRS = [{ id: 1, label: 'GCash', accountName: 'R. C.', note: 'Send the exact amount.', image: '/api/vip/qr/1' }];

interface Request {
  id: number; level: number; name: string; currency: 'USD' | 'PHP'; priceCents: number; reference: string; status: 'P' | 'A' | 'R';
  reason: string | null; createdAt: string; decidedAt: string | null; vipEndsAt: string | null; receipt: string | null;
}
interface Mock { loggedIn: boolean; vip: { level: number; name: string; endsAt: string } | null; requests: Request[]; posts: Record<string, unknown>[]; sendAnswer?: { status: number; json: unknown } }

async function mockService(page: Page, start: Partial<Mock> = {}): Promise<Mock> {
  const mock: Mock = { loggedIn: false, vip: null, requests: [], posts: [], ...start };
  await page.route('**/api/account/session', (route) => (mock.loggedIn
    ? route.fulfill({ json: { account: 'tester1', csrf: 'tok' } }) : route.fulfill({ status: 401, json: { error: 'session' } })));
  await page.route('**/api/account/login', (route) => {
    const body = route.request().postDataJSON() as { account: string; password: string };
    if (body.password !== 'password-one') return route.fulfill({ status: 400, json: { error: 'wrong' } });
    mock.loggedIn = true;
    return route.fulfill({ json: { account: 'tester1', csrf: 'tok' } });
  });
  await page.route('**/api/account/logout', (route) => { mock.loggedIn = false; return route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/vip', (route) => route.fulfill({
    json: { tiers: TIERS, qrs: QRS, maxPending: 3, ...(mock.loggedIn ? { me: { account: 'tester1', vip: mock.vip, requests: mock.requests } } : {}) },
  }));
  await page.route('**/api/vip/qr/*', (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route('**/api/vip/receipt/*', (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route('**/api/vip/requests', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    mock.posts.push({ ...body, token: route.request().headers()['x-site-token'] });
    if (mock.sendAnswer !== undefined) return route.fulfill(mock.sendAnswer);
    const tier = TIERS.find((t) => t.level === body.tier)!;
    const currency = body.currency === 'PHP' ? 'PHP' : 'USD';
    mock.requests.unshift({
      id: mock.requests.length + 1, level: tier.level, name: tier.name, currency, priceCents: currency === 'PHP' ? tier.pricePhpCents : tier.priceCents,
      reference: String(body.reference), status: 'P',
      reason: null, createdAt: '2026-11-16T03:00:00Z', decidedAt: null, vipEndsAt: null, receipt: `/api/vip/receipt/${mock.requests.length + 1}`,
    });
    return route.fulfill({ status: 201, json: { id: mock.requests.length } });
  });
  return mock;
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => { throw new Error(`unexpected dialog: ${dialog.message()}`); });
});

test('shows the four tiers and the payment QR to everyone, and asks for the game account to send', async ({ page }) => {
  await mockService(page);
  await page.goto('/vip/');
  await expect(page.getByRole('heading', { name: 'Support / VIP' })).toBeVisible();
  for (const [name, price] of [['VIP 1', '$2'], ['VIP 2', '$4'], ['VIP 3', '$6'], ['VIP 4', '$10']]) {
    await expect(page.locator('.vip-tier', { hasText: name })).toContainText(price);
  }
  await expect(page.getByRole('button', { name: 'US$' })).toHaveAttribute('aria-pressed', 'true');
  const qr = page.locator('.vip-qr');
  await expect(qr).toContainText('GCash');
  await expect(qr).toContainText('R. C.');
  await expect.poll(() => qr.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  await expect(page.locator('.vip-requests')).toBeHidden();
  // no sideways scroll, on a desktop or a phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('logs in, sends a receipt and a reference for VIP 4, and shows it as Processing', async ({ page }) => {
  const mock = await mockService(page);
  await page.goto('/vip/');
  await page.getByLabel('Account').fill('tester1');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Wrong account or password.')).toBeVisible();
  await page.getByLabel('Password').fill('password-one');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.locator('.vip-who')).toContainText('Logged in as tester1');
  await expect(page.getByText('No VIP now.')).toBeVisible();

  await page.locator('.vip-tier', { hasText: 'VIP 4' }).click();
  await expect(page.locator('.vip-pay-line')).toContainText('Pay $10 for VIP 4');
  const send = page.getByRole('button', { name: 'Send for VIP 4' });
  await send.click();
  await expect(page.getByText('Pick the receipt picture.')).toBeVisible();
  await page.getByLabel('Receipt picture').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.vip-preview')).toBeVisible();
  await page.getByLabel('Reference number').fill('<b>');
  await send.click();
  await expect(page.getByText('Type the reference number as the receipt shows it')).toBeVisible();
  expect(mock.posts).toHaveLength(0);
  await page.getByLabel('Reference number').fill('GC 1234 5678');
  await send.click();

  const request = page.locator('.vip-request').first();
  await expect(request).toContainText('VIP 4 · $10');
  await expect(request).toContainText('Processing');
  await expect(request).toContainText('Reference GC 1234 5678');
  await expect(page.locator('.vip-done')).toContainText('Sent. Your request for VIP 4 is processing');
  expect(mock.posts).toHaveLength(1);
  const post = mock.posts[0]!;
  expect(post).toMatchObject({ tier: 4, currency: 'USD', reference: 'GC 1234 5678', token: 'tok' });
  expect(typeof post.requestId).toBe('string');
  // the page sends the picture drawn again as a JPEG (or the file itself), as base64 without a data: start
  const bytes = Buffer.from(String(post.receipt), 'base64');
  expect(bytes[0] === 0xff && bytes[1] === 0xd8 || bytes.subarray(1, 4).toString() === 'PNG').toBe(true);
  // the form is empty again, ready for another one
  await expect(page.getByLabel('Reference number')).toHaveValue('');
});

test('says why a request was refused, in plain words', async ({ page }) => {
  const mock = await mockService(page, { loggedIn: true });
  await page.goto('/vip/');
  const tryOnce = async (answer: { status: number; json: unknown }, text: string) => {
    mock.sendAnswer = answer;
    await page.getByLabel('Receipt picture').setInputFiles({ name: 'r.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('Reference number').fill('REF-0001');
    await page.getByRole('button', { name: /^Send for/ }).click();
    await expect(page.locator('.site-form-inline .site-alert')).toContainText(text);
  };
  await tryOnce({ status: 409, json: { error: 'reference', max: 3 } }, 'That reference number was already sent.');
  await tryOnce({ status: 409, json: { error: 'too_many', max: 3 } }, 'You already have 3 requests processing.');
  await tryOnce({ status: 400, json: { error: 'invalid', field: 'receipt' } }, 'That file is not a picture we can take.');
  await tryOnce({ status: 429, json: { error: 'slow_down' } }, 'Too many sends from your account.');
});

test('shows an approved request with its VIP end date, a rejected one with the reason, and what a new tier does', async ({ page }) => {
  await mockService(page, {
    loggedIn: true,
    vip: { level: 2, name: 'VIP 2', endsAt: '2026-12-16T03:00:00Z' },
    requests: [
      { id: 3, level: 1, name: 'VIP 1', currency: 'PHP', priceCents: 11500, reference: 'GC-OLD', status: 'R', reason: 'Wrong amount.', createdAt: '2026-09-01T03:00:00Z', decidedAt: '2026-09-01T05:00:00Z', vipEndsAt: null, receipt: null },
      { id: 2, level: 3, name: 'VIP 3', currency: 'USD', priceCents: 600, reference: 'MAYA-9', status: 'R', reason: 'No payment with this reference came in.', createdAt: '2026-11-15T03:00:00Z', decidedAt: '2026-11-15T05:00:00Z', vipEndsAt: null, receipt: '/api/vip/receipt/2' },
      { id: 1, level: 2, name: 'VIP 2', currency: 'USD', priceCents: 400, reference: 'GC-1', status: 'A', reason: null, createdAt: '2026-11-14T03:00:00Z', decidedAt: '2026-11-14T04:00:00Z', vipEndsAt: '2026-12-16T03:00:00Z', receipt: '/api/vip/receipt/1' },
    ],
  });
  await page.goto('/vip/');
  await expect(page.locator('.vip-now')).toContainText('Your VIP: VIP 2 until');
  const rejected = page.locator('.vip-request[data-status="R"]', { hasText: 'MAYA-9' });
  await expect(rejected).toContainText('Reason: No payment with this reference came in.');
  await expect(rejected).toContainText('Rejected');
  await expect(rejected.getByRole('link', { name: 'See the receipt you sent' })).toBeVisible();
  // an old rejected one: its own currency, and its picture deleted
  const old = page.locator('.vip-request', { hasText: 'GC-OLD' });
  await expect(old).toContainText('VIP 1 · ₱115');
  await expect(old).toContainText('The receipt picture was deleted');
  await expect(old.getByRole('link')).toHaveCount(0);
  await expect(page.locator('.vip-request[data-status="A"]')).toContainText('VIP until');
  // VIP 1 is first: another tier than the one that runs
  await expect(page.locator('.vip-note')).toContainText('VIP 1 starts when we approve it');
  await page.locator('.vip-tier', { hasText: 'VIP 2' }).click();
  await expect(page.locator('.vip-note')).toContainText('one more month is added to its end');
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('in the Philippines', () => {
  test.use({ timezoneId: 'Asia/Manila', locale: 'en-PH' });

  test('shows peso prices, sends the request in pesos, and switches to US$ when asked (remembered)', async ({ page }) => {
    const mock = await mockService(page, { loggedIn: true });
    await page.goto('/vip/');
    for (const [name, price] of [['VIP 1', '₱115'], ['VIP 2', '₱230'], ['VIP 3', '₱345'], ['VIP 4', '₱575']]) {
      await expect(page.locator('.vip-tier', { hasText: name })).toContainText(price);
    }
    await expect(page.getByRole('button', { name: '₱ Pesos' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.vip-tier', { hasText: 'VIP 4' }).click();
    await expect(page.locator('.vip-pay-line')).toContainText('Pay ₱575 for VIP 4');
    await page.getByLabel('Receipt picture').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
    await page.getByLabel('Reference number').fill('GC 5555 6666');
    await page.getByRole('button', { name: 'Send for VIP 4' }).click();
    await expect(page.locator('.vip-request').first()).toContainText('VIP 4 · ₱575');
    expect(mock.posts[0]).toMatchObject({ tier: 4, currency: 'PHP' });

    await page.getByRole('button', { name: 'US$' }).click();
    await expect(page.locator('.vip-tier', { hasText: 'VIP 4' })).toContainText('$10');
    await expect(page.locator('.vip-pay-line')).toContainText('Pay $10 for VIP 4');
    // the request already sent keeps what it was sent in
    await expect(page.locator('.vip-request').first()).toContainText('VIP 4 · ₱575');
    await page.reload();
    await expect(page.locator('.vip-tier', { hasText: 'VIP 1' })).toContainText('$2');
    await expect(page.getByRole('button', { name: 'US$' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('shows US$ for a tier without a peso price, and no switch when no tier has one', async ({ page }) => {
    await page.route('**/api/account/session', (route) => route.fulfill({ status: 401, json: { error: 'session' } }));
    await page.route('**/api/vip/qr/*', (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
    let tiers = TIERS.map((t) => (t.level === 2 ? { ...t, pricePhpCents: null } : t));
    await page.route('**/api/vip', (route) => route.fulfill({ json: { tiers, qrs: QRS, maxPending: 3 } }));
    await page.goto('/vip/');
    await expect(page.locator('.vip-tier', { hasText: 'VIP 1' })).toContainText('₱115');
    await expect(page.locator('.vip-tier', { hasText: 'VIP 2' })).toContainText('$4');
    tiers = TIERS.map((t) => ({ ...t, pricePhpCents: null }));
    await page.reload();
    await expect(page.locator('.vip-tier', { hasText: 'VIP 1' })).toContainText('$2');
    await expect(page.locator('.vip-currency')).toBeHidden();
  });
});

test('says Support / VIP is not open while the service has it off', async ({ page }) => {
  await page.route('**/api/account/session', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.route('**/api/vip', (route) => route.fulfill({ status: 503, json: { error: 'off' } }));
  await page.goto('/vip/');
  await expect(page.getByText('Support / VIP is not open yet.')).toBeVisible();
  await expect(page.locator('.vip-tier')).toHaveCount(0);
});

// @vitest-environment jsdom
// custom (owner 2026-11-20, redeem codes): the Redeem Code window (world/codes/redeemCodeWindow.ts), on a fake code
// service: Check on Enter, the offer's lines, the bag message, the password row, Paste.

import { afterEach, expect, it, vi } from 'vitest';
import type { Answer, CodeCheckView, CodeOfferView } from '../src/site/vipApi';
import type { CodeApiLike } from '../src/world/codes/codeRedeemer';
import { RedeemCodeWindow } from '../src/world/codes/redeemCodeWindow';
import type { RedeemCodeHost } from '../src/world/codes/redeemCodeWindow';
import type { UiArt } from '../src/world/hud/art';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const OFFER: CodeOfferView = { codeId: 3, label: 'Launch', vipLevel: 2, vipDays: 7, expiresAt: '2026-12-15T00:00:00Z', items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }] };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function opened(api: Partial<CodeApiLike> = {}, free = 14) {
  const full: CodeApiLike = {
    session: vi.fn(async () => 'tester1'),
    login: vi.fn(async () => ({ ok: true, value: 'tester1' }) as Answer<string>),
    codeCheck: vi.fn(async () => ({ ok: true, value: { offer: OFFER, vip: null, replaces: false } }) as Answer<CodeCheckView>),
    codeRedeem: vi.fn(async () => ({ ok: true, value: { useId: 9, offer: OFFER, vip: { level: 2, endsAt: '2026-11-27T00:00:00Z' }, repeat: false } }) as Answer<never>),
    ...api,
  };
  const host: RedeemCodeHost = {
    api: full, account: () => 'tester1', playerId: () => 1, freeSlots: () => free, now: () => Date.UTC(2026, 10, 20),
    expectMails: () => {}, newRequestId: () => 'press-1',
    item: (id) => ({ name: id === 10206 ? 'Remantis Laccotte' : 'Town Blinkwing', iconUrl: `/assets/icon-${id}.png` }),
  };
  const window = new RedeemCodeWindow(host, art);
  document.body.append(window.element);
  window.open();
  const code = window.window.input('WIDC_CODE');
  const password = window.window.input('WIDC_PASSWORD');
  const button = (name: string) => window.element.querySelector<HTMLButtonElement>(`button[data-redeem="${name}"]`)!;
  return { window, api: full, code, password, button, text: () => window.element.textContent ?? '' };
}

it('checks the code on Enter and lists what it gives', async () => {
  const { api, code, text } = opened();
  code.value = 'welcome-2026';
  code.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flush();
  expect(api.codeCheck).toHaveBeenCalledWith('welcome-2026');
  expect(text()).toContain('VIP2 for 7 days');
  expect(text()).toContain('Remantis Laccotte ×5');
  expect(text()).toContain('Town Blinkwing ×2');
  expect(text()).toContain('Needs 2 free bag slots (you have 14).');
});

it('keeps Redeem from sending with a full bag, and says how much room it needs', async () => {
  const { api, code, button, text } = opened({}, 1);
  code.value = 'WELCOME2026';
  button('check').click();
  await flush();
  button('redeem').click();
  await flush();
  expect(api.codeRedeem).not.toHaveBeenCalled();
  expect(text()).toContain('Make room in your bag: this code needs 2 free slots (you have 1).');
});

it('redeems and shows the done lines', async () => {
  const { code, button, text } = opened();
  code.value = 'WELCOME2026';
  button('check').click();
  await flush();
  button('redeem').click();
  await flush();
  expect(text()).toContain('Done! Your items arrive in your bag within about a minute.');
  expect(text()).toContain('You have VIP2 until 27 Nov 2026. Log out and in again to see it.');
});

it('shows the password row only when the session is lost', async () => {
  const { code, button, password } = opened({ session: async () => undefined, codeCheck: async () => ({ ok: false, error: 'session' }) });
  const row = () => password.closest<HTMLElement>('[data-control]')!;
  expect(row().hidden).toBe(true);
  code.value = 'WELCOME2026';
  button('check').click();
  await flush();
  expect(row().hidden).toBe(false);
  expect(password.type).toBe('password');
});

it('says how to paste when the browser gives no clipboard', async () => {
  vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
  const { button, text } = opened();
  button('paste').click();
  await flush();
  expect(text()).toContain('Long-press the box and choose Paste.');
});

it('pastes the clipboard into the code box', async () => {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { readText: async () => '  ABCD-EFGH-JKMN-PQRS\n' } });
  const { button, code } = opened();
  button('paste').click();
  await flush();
  expect(code.value).toBe('ABCD-EFGH-JKMN-PQRS');
});

// Redeem codes (2026-11-20): the Redeem Code window's steps and texts, without the window: every answer of the code
// service, the bag check, the replace confirm, a lost session, a lost answer.
import { describe, expect, it, vi } from 'vitest';
import type { Answer, CodeCheckView, CodeOfferView, CodeRedeemView } from '../src/site/vipApi';
import { CODE_TEXTS, CODE_TIMEOUT_MS, CodeRedeemer, codeFormatOk, dayText, freeBagSlots } from '../src/world/codes/codeRedeemer';
import type { CodeApiLike, CodeView } from '../src/world/codes/codeRedeemer';

const NOW = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;
const OFFER: CodeOfferView = { codeId: 3, label: 'Launch', vipLevel: 0, vipDays: 0, expiresAt: '2026-12-15T12:00:00Z', items: [{ itemId: 10206, count: 5 }, { itemId: 4805, count: 2 }] };

function setUp(api: Partial<CodeApiLike> = {}, free = 14) {
  const calls = { redeem: [] as Array<[string, number, string, boolean]>, expected: [] as number[], said: [] as string[] };
  const full: CodeApiLike = {
    session: vi.fn(async () => 'tester1'),
    login: vi.fn(async () => ({ ok: true, value: 'tester1' }) as Answer<string>),
    codeCheck: vi.fn(async () => ({ ok: true, value: { offer: OFFER, vip: null, replaces: false } }) as Answer<CodeCheckView>),
    codeRedeem: vi.fn(async (code: string, character: number, requestId: string, confirm: boolean) => {
      calls.redeem.push([code, character, requestId, confirm]);
      return { ok: true, value: { useId: 9, offer: OFFER, vip: null, repeat: false } } as Answer<CodeRedeemView>;
    }),
    ...api,
  };
  const views: CodeView[] = [];
  let ids = 0;
  const host = {
    api: full, account: () => 'tester1', playerId: () => 1, freeSlots: () => free, now: () => NOW,
    expectMails: (useId: number) => { calls.expected.push(useId); }, newRequestId: () => `press-${++ids}`,
    say: (text: string) => { calls.said.push(text); },
  };
  const redeemer = new CodeRedeemer(host, (view) => views.push(view));
  return { redeemer, api: full, calls, views, setFree: (n: number) => { free = n; } };
}

describe('codeFormatOk and freeBagSlots', () => {
  it('takes 4 to 32 letters and digits once spaces and dashes are dropped', () => {
    expect(codeFormatOk(' abcd-efgh jkmn-pqrs ')).toBe(true);
    for (const bad of ['abc', 'a'.repeat(33), 'ABCD!', '']) expect(codeFormatOk(bad), bad).toBe(false);
  });

  it('counts the empty slots of the main bag only (0-41)', () => {
    const slots = Array.from({ length: 73 }, (_, i) => 1000 + i);
    const inventory = new Map<number, unknown>([[1000, {}], [1001, {}], [1050, {}]]);
    expect(freeBagSlots({ inventory, inventorySlots: slots })).toBe(40);
    expect(freeBagSlots({ inventory: null, inventorySlots: slots })).toBe(0);
  });
});

describe('CodeRedeemer', () => {
  it('refuses a badly typed code without asking the service', async () => {
    const { redeemer, api } = setUp();
    await redeemer.check('ab');
    expect(redeemer.view).toEqual({ step: 'enter', message: CODE_TEXTS.format });
    expect(api.codeCheck).not.toHaveBeenCalled();
  });

  it('shows the offer with the slots it needs and the slots the bag has', async () => {
    const { redeemer } = setUp();
    await redeemer.check('WELCOME2026');
    expect(redeemer.view).toMatchObject({ step: 'offer', needed: 2, free: 14, warning: null, confirming: false, message: null });
  });

  it('asks for room instead of redeeming when the bag is too full', async () => {
    const { redeemer, api, setFree } = setUp();
    await redeemer.check('WELCOME2026');
    setFree(1);
    await redeemer.redeem();
    expect(redeemer.view).toMatchObject({ step: 'offer', message: 'Make room in your bag: this code needs 2 free slots (you have 1).' });
    expect(api.codeRedeem).not.toHaveBeenCalled();
  });

  it('gives both dates when a higher VIP refuses the whole code', async () => {
    const { redeemer } = setUp({
      codeCheck: async () => ({ ok: false, error: 'lower_vip', offer: { ...OFFER, vipLevel: 1, vipDays: 30 }, vip: { level: 4, endsAt: '2026-11-30T12:00:00Z' } }),
    });
    await redeemer.check('VIPONE');
    expect(redeemer.view).toEqual({
      step: 'enter', message: 'You have VIP4 until 30 Nov 2026. This code gives VIP1 and works until 15 Dec 2026. Use it after your VIP ends.',
    });
  });

  it('warns before replacing a lower VIP, and sends the confirm on the second press', async () => {
    const { redeemer, calls } = setUp({
      codeCheck: async () => ({ ok: true, value: { offer: { ...OFFER, vipLevel: 3, vipDays: 7, items: [] }, vip: { level: 1, endsAt: new Date(NOW + 20 * DAY).toISOString() }, replaces: true } }),
    });
    await redeemer.check('VIPTHREE');
    expect(redeemer.view).toMatchObject({ step: 'offer', warning: 'This ends your VIP1 (20 days left) and gives VIP3 for 7 days.', confirming: false });
    await redeemer.redeem();
    expect(redeemer.view).toMatchObject({ step: 'offer', confirming: true });
    expect(calls.redeem).toEqual([]);
    await redeemer.redeem();
    expect(calls.redeem).toEqual([['VIPTHREE', 1, 'press-1', true]]);
  });

  it('asks for the password after a lost session, then shows the same code\'s offer', async () => {
    let lost = true;
    const { redeemer, api } = setUp({
      session: vi.fn(async () => (lost ? undefined : 'tester1')),
      login: vi.fn(async () => { lost = false; return { ok: true, value: 'tester1' } as Answer<string>; }),
      codeCheck: vi.fn(async () => (lost ? { ok: false, error: 'session' } : { ok: true, value: { offer: OFFER, vip: null, replaces: false } }) as Answer<CodeCheckView>),
    });
    await redeemer.check('WELCOME2026');
    expect(redeemer.view).toEqual({ step: 'password', message: CODE_TEXTS.password });
    await redeemer.password('pw');
    expect(api.login).toHaveBeenCalledWith('tester1', 'pw');
    expect(redeemer.view).toMatchObject({ step: 'offer', check: { offer: { label: 'Launch' } } });
  });

  it('says a wrong password, and stays on the password row', async () => {
    const { redeemer } = setUp({
      session: async () => undefined,
      codeCheck: async () => ({ ok: false, error: 'session' }),
      login: async () => ({ ok: false, error: 'wrong' }),
    });
    await redeemer.check('WELCOME2026');
    await redeemer.password('nope');
    expect(redeemer.view).toEqual({ step: 'password', message: 'Wrong password.' });
  });

  it('sends the same request id after a lost answer, and shows the done lines of the repeat', async () => {
    vi.useFakeTimers();
    try {
      let first = true;
      const { redeemer, calls } = setUp({
        codeRedeem: vi.fn(async (code: string, character: number, requestId: string, confirm: boolean) => {
          calls.redeem.push([code, character, requestId, confirm]);
          if (first) {
            first = false;
            return new Promise<Answer<CodeRedeemView>>(() => {}); // never answers
          }
          return { ok: true, value: { useId: 9, offer: OFFER, vip: null, repeat: true } } as Answer<CodeRedeemView>;
        }),
      });
      await redeemer.check('WELCOME2026');
      const pressed = redeemer.redeem();
      await vi.advanceTimersByTimeAsync(CODE_TIMEOUT_MS + 10);
      await pressed;
      expect(redeemer.view).toMatchObject({ step: 'offer', message: CODE_TEXTS.unreachable });
      await redeemer.redeem();
      expect(calls.redeem.map((c) => c[2])).toEqual(['press-1', 'press-1']);
      expect(redeemer.view).toEqual({ step: 'done', lines: [CODE_TEXTS.done] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the item and the VIP lines, and expects the mails, for an item and VIP code', async () => {
    const offer = { ...OFFER, vipLevel: 2, vipDays: 7 };
    const { redeemer, calls } = setUp({
      codeCheck: async () => ({ ok: true, value: { offer, vip: null, replaces: false } }),
      codeRedeem: async () => ({ ok: true, value: { useId: 9, offer, vip: { level: 2, endsAt: '2026-11-27T12:00:00Z' }, repeat: false } }),
    });
    await redeemer.check('BOTH1234');
    await redeemer.redeem();
    expect(redeemer.view).toEqual({ step: 'done', lines: [CODE_TEXTS.done, 'You have VIP2 until 27 Nov 2026. Log out and in again to see it.'] });
    expect(calls.expected).toEqual([9]);
  });

  it('says the done lines in the chat too, so a closed window loses nothing (the final review)', async () => {
    const offer = { ...OFFER, vipLevel: 2, vipDays: 7 };
    const { redeemer, calls } = setUp({
      codeCheck: async () => ({ ok: true, value: { offer, vip: null, replaces: false } }),
      codeRedeem: async () => ({ ok: true, value: { useId: 9, offer, vip: { level: 2, endsAt: '2026-11-27T12:00:00Z' }, repeat: false } }),
    });
    await redeemer.check('BOTH1234');
    await redeemer.redeem();
    expect(calls.said).toEqual([CODE_TEXTS.done, 'You have VIP2 until 27 Nov 2026. Log out and in again to see it.']);
  });

  it('after a lost answer, Check of the same code gets the first answer instead of "already used" (the final review)', async () => {
    vi.useFakeTimers();
    try {
      let used = false; // the website used the code, but its answer was lost
      let lost = true;
      const { redeemer, calls } = setUp({
        codeCheck: vi.fn(async () => (used
          ? { ok: false, error: 'mine', offer: OFFER, vip: null }
          : { ok: true, value: { offer: OFFER, vip: null, replaces: false } }) as Answer<CodeCheckView>),
        codeRedeem: vi.fn(async (code: string, character: number, requestId: string, confirm: boolean) => {
          calls.redeem.push([code, character, requestId, confirm]);
          used = true;
          if (lost) {
            lost = false;
            return new Promise<Answer<CodeRedeemView>>(() => {}); // the answer never comes back
          }
          return { ok: true, value: { useId: 9, offer: OFFER, vip: null, repeat: true } } as Answer<CodeRedeemView>;
        }),
      });
      await redeemer.check('welcome-2026');
      const pressed = redeemer.redeem();
      await vi.advanceTimersByTimeAsync(CODE_TIMEOUT_MS + 10);
      await pressed;
      expect(redeemer.view).toMatchObject({ step: 'offer', message: CODE_TEXTS.unreachable });
      await redeemer.check('WELCOME2026'); // the player checks again instead of pressing Redeem
      expect(calls.redeem.map((c) => c[2])).toEqual(['press-1', 'press-1']);
      expect(redeemer.view).toEqual({ step: 'done', lines: [CODE_TEXTS.done] });
      expect(calls.expected).toEqual([9]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows dates in the player\'s own time zone (the final review)', () => {
    const iso = '2026-11-26T20:00:00Z';
    expect(dayText(iso)).toBe(new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  });

  it('expects no mails for a VIP-only code', async () => {
    const offer = { ...OFFER, vipLevel: 1, vipDays: 3, items: [] };
    const { redeemer, calls } = setUp({
      codeCheck: async () => ({ ok: true, value: { offer, vip: null, replaces: false } }),
      codeRedeem: async () => ({ ok: true, value: { useId: 4, offer, vip: { level: 1, endsAt: '2026-11-23T12:00:00Z' }, repeat: false } }),
    });
    await redeemer.check('VIPONLY1');
    await redeemer.redeem();
    expect(redeemer.view).toEqual({ step: 'done', lines: ['You have VIP1 until 23 Nov 2026. Log out and in again to see it.'] });
    expect(calls.expected).toEqual([]);
  });

  it('names each refusal of the service', async () => {
    for (const [error, text] of [
      ['unknown', "This code doesn't exist."], ['too_many', 'Too many tries. Try again in an hour.'], ['expired', 'This code has expired.'],
      ['inactive', 'This code is no longer active.'], ['claimed', 'This code has been fully claimed.'], ['key_used', 'This code was already used.'],
      ['mine', 'You already used this code.'], ['not_listed', "This code isn't for your account."], ['off', 'Codes are not available right now.'],
      ['unreachable', "Can't reach the code service. Try again in a minute."], ['server', 'Something went wrong. Nothing was used. Try again.'],
    ] as const) {
      const { redeemer } = setUp({ codeCheck: async () => ({ ok: false, error }) });
      await redeemer.check('SOMECODE');
      expect(redeemer.view, error).toEqual({ step: 'enter', message: text });
    }
  });
});

import { hashPassword } from '@flyffweb/protocol';
import { expect, it } from 'vitest';
import { ACCOUNT_ACTIONS } from '../src/admin/actions/accounts';
import { dayText, MemoryAdminStore, memoryAccount, memoryCharacter } from './support/memoryAdminStore';
import { testContext, testDeps } from './support/adminDeps';

function setUp() {
  let deps: ReturnType<typeof testDeps>;
  const store = new MemoryAdminStore({
    accounts: [memoryAccount('Poreotix', { email: 'owner@example.com', authority: 'P' }), memoryAccount('tester1')],
    characters: [memoryCharacter('0000001', 'Hero', 'Poreotix'), memoryCharacter('0000002', 'Alt', 'tester1')],
  }, () => deps.now());
  deps = testDeps({ store });
  return { deps, store, ctx: testContext(deps) };
}

const act = (name: keyof typeof ACCOUNT_ACTIONS, body: Record<string, unknown>, s: ReturnType<typeof setUp>) =>
  ACCOUNT_ACTIONS[name](body, s.ctx, s.deps);

/** `yyyy-mm-dd` for the day `days` from the test clock. */
function dateInput(deps: ReturnType<typeof testDeps>, days: number): string {
  const t = dayText(deps.now(), days);
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
}

it('finds an account whatever its case and spaces, and writes to the name as stored', async () => {
  const s = setUp();
  const got = await act('accounts.get', { account: ' POREOTIX ' }, s);
  expect(got.status).toBe(200);
  expect((got.body.account as { account: string }).account).toBe('Poreotix');
  expect((got.body.characters as { name: string }[]).map((c) => c.name)).toEqual(['Hero']);
  const ban = await act('accounts.ban', { account: ' POREOTIX ', until: dateInput(s.deps, 3), reason: 'test ban' }, s);
  expect(ban.status).toBe(200);
  expect(s.store.accounts[0]!.blockTime).toBe(dayText(s.deps.now(), 3));
  expect(s.store.log.at(-1)).toMatchObject({ action: 'accounts.ban', account: 'Poreotix', result: 'ok' });
  expect(s.store.log.at(-1)!.after).toContain('test ban');
});

it('searches by account prefix, email or character name', async () => {
  const s = setUp();
  const byPrefix = await act('accounts.search', { account: 'pore' }, s);
  expect((byPrefix.body.rows as { account: string }[]).map((a) => a.account)).toEqual(['Poreotix']);
  const byEmail = await act('accounts.search', { email: 'OWNER@example.com' }, s);
  expect((byEmail.body.rows as { account: string }[]).map((a) => a.account)).toEqual(['Poreotix']);
  const byCharacter = await act('accounts.search', { characterName: 'al' }, s);
  expect((byCharacter.body.rows as { account: string }[]).map((a) => a.account)).toEqual(['tester1']);
  expect((await act('accounts.search', {}, s)).status).toBe(400);
});

it('sets the GM level on the account and its characters, and refuses other letters', async () => {
  const s = setUp();
  expect((await act('accounts.authority', { account: 'tester1', authority: 'X', requestId: 'r' }, s)).status).toBe(400);
  const set = await act('accounts.authority', { account: 'tester1', authority: 'L' }, s);
  expect(set.status).toBe(200);
  expect(s.store.calls.filter((c) => c.startsWith('set'))).toEqual(['setLoginAuthority', 'setCharacterAuthority']);
  expect(s.store.accounts[1]!.authority).toBe('L');
  expect(s.store.characters[1]!.authority).toBe('L');
  expect(s.store.log.filter((r) => r.action === 'accounts.authority')).toHaveLength(1);
  expect(s.store.log.at(-1)).toMatchObject({ result: 'ok', before: '{"authority":"F"}' });
});

it('bans forever, refuses a past date, and unbans with SQL Server\'s yesterday', async () => {
  const s = setUp();
  expect((await act('accounts.ban', { account: 'tester1', until: 'forever', reason: 'cheating' }, s)).status).toBe(200);
  expect(s.store.accounts[1]!.blockTime).toBe('99991231');
  expect(await act('accounts.ban', { account: 'tester1', until: dateInput(s.deps, -1), reason: 'x' }, s))
    .toMatchObject({ status: 400, body: { error: 'invalid', field: 'until' } });
  expect((await act('accounts.ban', { account: 'tester1', until: '2026-02-30', reason: 'x' }, s)).body.field).toBe('until');
  expect((await act('accounts.ban', { account: 'tester1', until: 'forever' }, s)).body.field).toBe('reason');
  const calls = s.store.calls.length;
  expect((await act('accounts.unban', { account: 'tester1' }, s)).status).toBe(200);
  expect(s.store.calls.slice(calls)).toContain('setBlockTime');
  expect(s.store.accounts[1]!.blockTime).toBe(dayText(s.deps.now(), -1));
});

it('resets a password without logging it or its hash', async () => {
  const s = setUp();
  expect((await act('accounts.password', { account: 'tester1', password: 'short' }, s)).body.field).toBe('password');
  expect((await act('accounts.password', { account: 'tester1', password: 'n3w password' }, s)).status).toBe(200);
  expect(s.store.accounts[1]!.passwordHash).toBe(hashPassword('n3w password'));
  const row = s.store.log.at(-1)!;
  expect(row).toMatchObject({ action: 'accounts.password', result: 'ok' });
  for (const secret of ['n3w password', hashPassword('n3w password')]) expect(row.before + row.after).not.toContain(secret);
});

it('changes the email with the sign-up rule', async () => {
  const s = setUp();
  expect((await act('accounts.email', { account: 'tester1', email: 'nope' }, s)).body.field).toBe('email');
  expect((await act('accounts.email', { account: 'tester1', email: 'new@example.com' }, s)).status).toBe(200);
  expect(s.store.accounts[1]!.email).toBe('new@example.com');
});

it('creates an account with the sign-up rules, reserved names allowed', async () => {
  const s = setUp();
  expect((await act('accounts.create', { account: 'admin1', password: 'abc12345', email: '' }, s)).status).toBe(200);
  expect(s.store.accounts.at(-1)!.account).toBe('admin1');
  expect((await act('accounts.create', { account: 'a!', password: 'abc12345', email: '' }, s)).body.field).toBe('account');
  expect((await act('accounts.create', { account: 'TESTER1', password: 'abc12345', email: '' }, s)))
    .toMatchObject({ status: 409, body: { error: 'taken' } });
});

it('answers 404 for a missing account, with no change and no ok row', async () => {
  const s = setUp();
  for (const name of ['accounts.get', 'accounts.ban', 'accounts.unban', 'accounts.authority', 'accounts.password', 'accounts.email'] as const) {
    const reply = await act(name, { account: 'nobody', until: 'forever', reason: 'x', authority: 'F', password: 'abc12345', email: '' }, s);
    expect(reply.status).toBe(404);
  }
  expect(s.store.log.filter((r) => r.result === 'ok')).toHaveLength(0);
  expect(s.store.calls.some((c) => c.startsWith('set'))).toBe(false);
});

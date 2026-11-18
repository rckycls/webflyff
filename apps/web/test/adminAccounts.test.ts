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

it('sets the level on the account and its characters, one audit row each, and refuses other letters', async () => {
  const s = setUp();
  expect((await act('accounts.authority', { account: 'tester1', authority: 'X', requestId: 'r' }, s)).status).toBe(400);
  // a lower-case letter would be past 'P' in the game: refused
  expect((await act('accounts.authority', { account: 'tester1', authority: 'p' }, s)).status).toBe(400);
  expect((await act('accounts.authority', { account: 'tester1', authority: 'L', characters: 'yes' }, s)).body.field).toBe('characters');
  const set = await act('accounts.authority', { account: 'tester1', authority: 'L' }, s);
  expect(set).toMatchObject({ status: 200, body: { ok: true, characters: 1 } });
  expect(s.store.calls.filter((c) => c.startsWith('set'))).toEqual(['setLoginAuthority', 'setCharacterAuthority']);
  expect(s.store.accounts[1]!.authority).toBe('L');
  expect(s.store.characters[1]!.authority).toBe('L');
  const rows = s.store.log.filter((r) => r.account === 'tester1');
  expect(rows.map((r) => [r.action, r.result])).toEqual([['accounts.authority', 'ok'], ['accounts.charactersAuthority', 'ok']]);
  expect(rows[0]).toMatchObject({ before: '{"authority":"F"}', after: '{"authority":"L"}' });
  expect(rows[1]).toMatchObject({ before: '{"characters":[{"name":"Alt","authority":"F"}]}', after: '{"authority":"L","characters":1}' });
  // the answer says which list pages are old now
  expect(set.body.stale).toEqual({ accounts: { names: ['tester1'] }, characters: { accounts: ['tester1'] } });
});

it('refuses VIP letters (2026-11-19: they come from the VIP tab), sets a level on the account alone when asked, and says when the characters\' part failed', async () => {
  const s = setUp();
  for (const letter of ['A', 'B', 'C', 'E']) {
    expect(await act('accounts.authority', { account: 'tester1', authority: letter, characters: false }, s)).toMatchObject({ status: 400, body: { field: 'authority' } });
  }
  const helper = await act('accounts.authority', { account: 'tester1', authority: 'J', characters: false }, s);
  expect(helper).toMatchObject({ status: 200, body: { ok: true, characters: 0 } });
  expect(s.store.accounts[1]!.authority).toBe('J');
  expect(s.store.characters[1]!.authority).toBe('F');
  expect(s.store.log.map((r) => r.action)).toEqual(['accounts.authority']);

  // the account's letter changes, its characters' do not: the log says so, and so does the answer
  s.store.failing.add('setCharacterAuthority');
  const half = await act('accounts.authority', { account: 'tester1', authority: 'L' }, s);
  expect(half.status).toBe(500);
  expect(half.body.message).toMatch(/account's level was changed, but its characters' levels were not/);
  expect(s.store.accounts[1]!.authority).toBe('L');
  expect(s.store.log.slice(1).map((r) => [r.action, r.result])).toEqual([['accounts.authority', 'ok'], ['accounts.charactersAuthority', 'failed']]);
});

it('pages the account list 10 at a time with the total, filters it, and keeps pages until an edit drops them', async () => {
  const s = setUp();
  for (let i = 1; i <= 23; i++) s.store.accounts.push(memoryAccount(`player${String(i).padStart(2, '0')}`, { email: i === 5 ? 'five@example.com' : null }));
  const first = await act('accounts.page', {}, s);
  expect(first.body).toMatchObject({ total: 25, page: 1, pageSize: 10, kept: false });
  expect((first.body.rows as { account: string }[]).map((a) => a.account)).toEqual(
    ['player01', 'player02', 'player03', 'player04', 'player05', 'player06', 'player07', 'player08', 'player09', 'player10']);
  const third = await act('accounts.page', { page: 3 }, s);
  expect((third.body.rows as { account: string }[]).map((a) => a.account)).toEqual(['player21', 'player22', 'player23', 'Poreotix', 'tester1']);
  expect((await act('accounts.page', { page: 0 }, s)).body.field).toBe('page');
  expect((await act('accounts.page', { account: 'PLAYER1' }, s)).body).toMatchObject({ total: 10 });
  expect((await act('accounts.page', { email: 'FIVE@example.com' }, s)).body).toMatchObject({ total: 1, rows: [{ account: 'player05' }] });
  expect((await act('accounts.page', { characterName: 'al' }, s)).body).toMatchObject({ total: 1, rows: [{ account: 'tester1' }] });

  // asked again: kept, no SQL
  const reads = () => s.store.calls.filter((c) => c === 'accountPage').length;
  const before = reads();
  expect((await act('accounts.page', { page: 1 }, s)).body.kept).toBe(true);
  expect(reads()).toBe(before);
  // a ban on tester1 drops only the page that shows tester1
  await act('accounts.ban', { account: 'tester1', until: 'forever', reason: 'x' }, s);
  expect((await act('accounts.page', { page: 1 }, s)).body.kept).toBe(true);
  expect((await act('accounts.page', { page: 3 }, s)).body).toMatchObject({ kept: false, rows: expect.arrayContaining([expect.objectContaining({ account: 'tester1', blockTime: '99991231' })]) });
  // a new account drops every page (the totals change); Refresh too
  await act('accounts.create', { account: 'newone', password: 'abc12345', email: '' }, s);
  expect((await act('accounts.page', { page: 1 }, s)).body).toMatchObject({ kept: false, total: 26 });
  expect((await act('accounts.page', { page: 1 }, s)).body.kept).toBe(true);
  expect((await act('accounts.page', { page: 1, fresh: true }, s)).body.kept).toBe(false);
  // kept 30 seconds at most
  s.deps.setNow(s.deps.now() + 31_000);
  expect((await act('accounts.page', { page: 1 }, s)).body.kept).toBe(false);
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

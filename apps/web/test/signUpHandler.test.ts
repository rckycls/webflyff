import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword, PREREG_OFF } from '@flyffweb/protocol';
import type { PreregRule } from '@flyffweb/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PreregSettings, readSignUps, SignUpBook } from '../src/signUpBook';
import type { AccountStore } from '../src/accountStore';
import type { SiegeRankRow, SiegeWeekly } from '../src/siege';
import { parseWebConfig } from '../src/config';
import { HourlyLimit } from '../src/hourlyLimit';
import { RefusalLog } from '../src/refusalLog';
import { handleSignUp } from '../src/signUpHandler';
import type { SignUpDeps, SignUpRequest } from '../src/signUpHandler';
import { TicketBook } from '../src/ticket';

const config = parseWebConfig({
  ...JSON.parse(readFileSync(fileURLToPath(new URL('../web.config.example.json', import.meta.url)), 'utf8')),
  siteOrigin: 'https://play.example.com',
  ticketSecret: 'k'.repeat(40),
});

/** A store that records its calls and answers what the test sets. */
class FakeStore implements AccountStore {
  calls: [string, string, string][] = [];
  answer: number | Error = 1;
  async create(account: string, passwordHash: string, email: string): Promise<number> {
    this.calls.push([account, passwordHash, email]);
    if (this.answer instanceof Error) throw this.answer;
    return this.answer;
  }
  async onlineCount(): Promise<number> { return 0; }
  async siegeWeekly(): Promise<SiegeWeekly> { return { champion: null, mvp: null, endedAt: null, expiresAt: null }; }
  async siegeRanking(): Promise<SiegeRankRow[]> { return []; }
}

let now: number;
let store: FakeStore;
let lines: string[];
let deps: SignUpDeps;

beforeEach(() => {
  now = 10_000_000;
  store = new FakeStore();
  lines = [];
  const clock = () => now;
  deps = {
    config, store,
    tickets: new TicketBook(config.ticketSecret, clock),
    attempts: new HourlyLimit(config.limits.attemptsPerHour, clock),
    createdByAddress: new HourlyLimit(config.limits.createdPerHourPerAddress, clock),
    createdInAll: new HourlyLimit(config.limits.createdPerHour, clock),
    log: { info: (line) => lines.push(line), warn: (line) => lines.push(line) },
    refusals: new RefusalLog({ info: (line) => lines.push(line), warn: (line) => lines.push(line) }),
    signUps: new SignUpBook(undefined, { info: (line) => lines.push(line), warn: (line) => lines.push(line) }),
    prereg: () => PREREG_OFF,
  };
});

/** A ticket given 5 s ago. */
function goodTicket(): string {
  const at = now;
  now -= 5000;
  const ticket = deps.tickets.issue();
  now = at;
  return ticket;
}

function post(body: unknown, overrides: Partial<SignUpRequest> = {}): SignUpRequest {
  return {
    address: '203.0.113.7', origin: config.siteOrigin, contentType: 'application/json', browser: '',
    body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), ...overrides,
  };
}

const form = (fields: Record<string, unknown> = {}) =>
  ({ account: 'hero_01', password: 'abc12345', email: '', website: '', ticket: goodTicket(), ...fields });

it('creates with the salted hash the login sends, lower-cased, cash never passed', async () => {
  const answer = await handleSignUp(post(form({ account: ' Hero_01 ', cash: 999, authority: 'Z' })), deps);
  expect(answer).toEqual({ status: 201, body: { ok: true } });
  expect(store.calls).toEqual([['hero_01', hashPassword('abc12345'), '']]);
  expect(hashPassword('abc12345')).toMatch(/^[0-9a-f]{32}$/);
  expect(lines).toEqual(['signup 203.0.113.7 hero_01 created']);
});

it('passes the email, trimmed', async () => {
  await handleSignUp(post(form({ email: ' hero@example.com ' })), deps);
  expect(store.calls[0]![2]).toBe('hero@example.com');
});

it.each([[0, 409, 'taken', 'taken'], [-1, 500, 'server', 'error'], [2, 500, 'server', 'error']])(
  'store answer %i → %i %s', async (result, status, error, word) => {
    store.answer = result;
    expect(await handleSignUp(post(form()), deps)).toEqual({ status, body: { error } });
    expect(lines[0]).toBe(`signup 203.0.113.7 hero_01 ${word}`);
  });

it('a store that throws is a 500, its message logged', async () => {
  store.answer = new Error('Login failed for user flyffweb_site.\nline two');
  expect(await handleSignUp(post(form()), deps)).toEqual({ status: 500, body: { error: 'server' } });
  expect(lines).toContain('signup 203.0.113.7 hero_01 error');
  expect(lines.some((line) => line.includes('Login failed for user flyffweb_site. line two'))).toBe(true);
});

it.each([
  [{ contentType: 'text/plain' }, 415, 'type'],
  [{ contentType: undefined }, 415, 'type'],
  [{ body: Buffer.alloc(1025, 0x20) }, 413, 'size'],
])('refuses %j with %i %s', async (overrides, status, error) => {
  expect(await handleSignUp(post(form(), overrides as Partial<SignUpRequest>), deps)).toEqual({ status, body: { error } });
  expect(store.calls).toEqual([]);
  expect(lines).toEqual([`signup 203.0.113.7 - ${error}`]);
});

it('takes application/json with a charset and a body of exactly 1024 bytes', async () => {
  const body = JSON.stringify(form());
  const padded = Buffer.from(body + ' '.repeat(1024 - body.length));
  expect(padded).toHaveLength(1024);
  expect(await handleSignUp(post('', { body: padded, contentType: 'application/json; charset=utf-8' }), deps))
    .toEqual({ status: 201, body: { ok: true } });
});

it('refuses another origin', async () => {
  for (const origin of ['https://evil.example', undefined, 'https://play.example.com.evil.example']) {
    expect(await handleSignUp(post(form(), { origin }), deps)).toEqual({ status: 403, body: { error: 'forbidden' } });
  }
  expect(store.calls).toEqual([]);
});

it.each([['{not json'], ['[1,2]'], ['"text"'], ['null']])('refuses the body %s as invalid', async (body) => {
  expect(await handleSignUp(post(body), deps)).toEqual({ status: 400, body: { error: 'invalid' } });
});

it('refuses a field that is not a string', async () => {
  expect(await handleSignUp(post(form({ account: ['hero_01'] })), deps)).toEqual({ status: 400, body: { error: 'invalid' } });
  expect(await handleSignUp(post(form({ email: 5 })), deps)).toEqual({ status: 400, body: { error: 'invalid' } });
  expect(store.calls).toEqual([]);
});

it('refuses a bad or reused ticket', async () => {
  expect(await handleSignUp(post(form({ ticket: 'nonsense' })), deps)).toEqual({ status: 400, body: { error: 'ticket' } });
  const ticket = goodTicket();
  expect((await handleSignUp(post(form({ ticket })), deps)).status).toBe(201);
  expect(await handleSignUp(post(form({ account: 'hero_02', ticket })), deps)).toEqual({ status: 400, body: { error: 'ticket' } });
  // too fresh: a bot that posts at once
  const fresh = deps.tickets.issue();
  expect(await handleSignUp(post(form({ account: 'hero_03', ticket: fresh })), deps)).toEqual({ status: 400, body: { error: 'ticket' } });
  expect(store.calls).toHaveLength(1);
});

it('fakes success for the trap field and creates nothing', async () => {
  expect(await handleSignUp(post(form({ website: 'x' })), deps)).toEqual({ status: 201, body: { ok: true } });
  expect(store.calls).toEqual([]);
  expect(lines).toEqual(['signup 203.0.113.7 hero_01 bot']);
});

it('refuses the 21st attempt, the 4th account from an address, and pauses at 60 in all', async () => {
  for (let i = 0; i < 20; i++) {
    expect((await handleSignUp(post(form({ account: 'abc' })), deps)).status).toBe(400);
  }
  expect(await handleSignUp(post(form()), deps)).toEqual({ status: 429, body: { error: 'too_many' } });
  expect(lines.at(-1)).toBe('signup 203.0.113.7 hero_01 too_many');

  for (let i = 0; i < 3; i++) {
    expect((await handleSignUp(post(form({ account: `hero_a${i}` }), { address: '198.51.100.1' }), deps)).status).toBe(201);
  }
  expect(await handleSignUp(post(form({ account: 'hero_a3' }), { address: '198.51.100.1' }), deps))
    .toEqual({ status: 429, body: { error: 'too_many' } });

  // 57 more from other addresses make 60 in all
  for (let i = 0; i < 57; i++) {
    const address = `192.0.2.${i}`;
    expect((await handleSignUp(post(form({ account: `hero_b${i}` }), { address }), deps)).status).toBe(201);
  }
  expect(await handleSignUp(post(form({ account: 'hero_c' }), { address: '192.0.2.200' }), deps))
    .toEqual({ status: 429, body: { error: 'paused' } });
  expect(lines.at(-1)).toBe('signup 192.0.2.200 hero_c paused');
  expect(store.calls).toHaveLength(60);

  // an hour later, all is open again
  now += 3_600_000;
  expect((await handleSignUp(post(form({ account: 'hero_d' })), deps)).status).toBe(201);
});

it('a taken name does not count as made', async () => {
  store.answer = 0;
  for (let i = 0; i < 5; i++) expect((await handleSignUp(post(form({ account: `hero_t${i}` })), deps)).status).toBe(409);
  store.answer = 1;
  expect((await handleSignUp(post(form()), deps)).status).toBe(201);
});

it('names the field for a broken rule', async () => {
  expect(await handleSignUp(post(form({ account: 'gm_lord' })), deps)).toEqual({ status: 400, body: { error: 'invalid', field: 'account' } });
  expect(lines.at(-1)).toBe('signup 203.0.113.7 gm_lord invalid:account');
  expect(await handleSignUp(post(form({ password: 'short1' })), deps)).toEqual({ status: 400, body: { error: 'invalid', field: 'password' } });
  expect(await handleSignUp(post(form({ email: 'nope' })), deps)).toEqual({ status: 400, body: { error: 'invalid', field: 'email' } });
  // the settings' reserved names
  const own = { ...deps, config: { ...config, reservedNames: { exact: ['hero_01'], prefixes: [] } } };
  expect(await handleSignUp(post(form()), own)).toEqual({ status: 400, body: { error: 'invalid', field: 'account' } });
  expect(store.calls).toEqual([]);
});

it('never logs the password, email or ticket, nor a line break from the body', async () => {
  const ticket = goodTicket();
  const secret = { password: 'Sup3rSecretPw', email: 'private@example.com', ticket };
  await handleSignUp(post(form(secret)), deps);
  store.answer = new Error(`boom Sup3rSecretPw`);
  await handleSignUp(post(form({ ...secret, account: 'hero_02', ticket: goodTicket() })), deps);
  await handleSignUp(post(form({ ...secret, account: 'x\ny injected', ticket: goodTicket() })), deps);
  await handleSignUp(post(form({ ...secret, website: 'bot' })), deps);
  for (const line of lines) {
    expect(line).not.toContain('Sup3rSecretPw');
    expect(line).not.toContain('private@example.com');
    expect(line).not.toContain(ticket.split('.')[2]);
    expect(line).not.toMatch(/[\r\n]/);
  }
});

/** A store whose creates answer only when `release()` is called, as a slow database does. */
function slowStore(): FakeStore & { release(): void } {
  const waiting: Array<() => void> = [];
  const store = new FakeStore();
  const create = store.create.bind(store);
  store.create = (...args) => new Promise<number>((resolve, reject) => {
    waiting.push(() => { create(...args).then(resolve, reject); });
  });
  return Object.assign(store, { release: () => { for (const go of waiting.splice(0)) go(); } });
}

it('counts the accounts being made, so requests sent at once cannot pass the limits', async () => {
  const slow = slowStore();
  const at = { ...deps, store: slow };
  const answers = Promise.all(Array.from({ length: 20 }, (_, i) => handleSignUp(post(form({ account: `hero_s${i}` })), at)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  slow.release();
  const statuses = (await answers).map((answer) => answer.status);
  expect(statuses.filter((status) => status === 201)).toHaveLength(3);
  expect(statuses.filter((status) => status === 429)).toHaveLength(17);
  expect(slow.calls).toHaveLength(3);
});

it('pauses at 60 in all for requests sent at once from many addresses', async () => {
  const slow = slowStore();
  const at = { ...deps, store: slow };
  const answers = Promise.all(Array.from({ length: 70 }, (_, i) =>
    handleSignUp(post(form({ account: `hero_m${i}` }), { address: `192.0.2.${i}` }), at)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  slow.release();
  const statuses = (await answers).map((answer) => answer.status);
  expect(statuses.filter((status) => status === 201)).toHaveLength(60);
  expect(slow.calls).toHaveLength(60);
});

it('gives the place back when the name is taken or the database fails', async () => {
  store.answer = 0;
  for (let i = 0; i < 3; i++) expect((await handleSignUp(post(form({ account: `hero_g${i}` })), deps)).status).toBe(409);
  store.answer = new Error('down');
  for (let i = 0; i < 3; i++) expect((await handleSignUp(post(form({ account: `hero_h${i}` })), deps)).status).toBe(500);
  store.answer = 1;
  for (let i = 0; i < 3; i++) expect((await handleSignUp(post(form({ account: `hero_k${i}` })), deps)).status).toBe(201);
  expect((await handleSignUp(post(form({ account: 'hero_k3' })), deps)).status).toBe(429);
});

it('does not let a flood of refused requests fill the log', async () => {
  for (let i = 0; i < 200; i++) await handleSignUp(post(form(), { origin: 'https://evil.example' }), deps);
  for (let i = 0; i < 200; i++) await handleSignUp(post('{not json'), deps);
  for (let i = 0; i < 40; i++) await handleSignUp(post(form({ account: 'abc' })), deps); // 20 invalid, then too_many
  expect(lines.filter((line) => line.endsWith(' forbidden'))).toHaveLength(1);
  expect(lines.filter((line) => line.endsWith(' invalid'))).toHaveLength(1);
  expect(lines.filter((line) => line.endsWith(' too_many'))).toHaveLength(1);
  // the attempts that reached the rules are each written: at most 20 an hour from an address
  expect(lines.filter((line) => line.endsWith(' invalid:account'))).toHaveLength(20);
  deps.refusals.flush();
  expect(lines).toContain('signup 203.0.113.7 forbidden x199 more in the last minute');
  expect(lines).toContain('signup 203.0.113.7 too_many x19 more in the last minute');
});

describe('the pre-registration cap (docs/2026-11-15-prereg-login.md)', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const on = (maxAccounts = 3): PreregRule => ({ ...PREREG_OFF, on: true, maxAccounts });
  const BROWSER_A = 'a'.repeat(22);
  const BROWSER_B = 'b'.repeat(22);

  function tempFile(): string {
    const dir = mkdtempSync(join(tmpdir(), 'signups-'));
    dirs.push(dir);
    return join(dir, 'signups.jsonl');
  }

  /** A sign-up of `account` from `address` and `browser`, past the hourly limits (a new hour each time). */
  async function signUp(account: string, address: string, browser = '') {
    now += 3_600_001;
    return handleSignUp(post(form({ account }), { address, browser }), deps);
  }

  it('lets one IP make the cap and refuses the next with 429 prereg_limit and the cap, over hours', async () => {
    deps.prereg = () => on(3);
    for (const name of ['acct_01', 'acct_02', 'acct_03']) expect((await signUp(name, '198.51.100.4')).status).toBe(201);
    expect(await signUp('acct_04', '198.51.100.4')).toEqual({ status: 429, body: { error: 'prereg_limit', max: 3 } });
    expect(lines.at(-1)).toBe('signup 198.51.100.4 acct_04 prereg_limit:ip');
    expect((await signUp('acct_05', '198.51.100.5')).status).toBe(201);
    expect(store.calls.map((c) => c[0])).toEqual(['acct_01', 'acct_02', 'acct_03', 'acct_05']);
  });

  it('counts the browser cookie too: a new IP does not help a browser at the cap', async () => {
    deps.prereg = () => on(2);
    expect((await signUp('acct_01', '198.51.100.1', BROWSER_A)).status).toBe(201);
    expect((await signUp('acct_02', '198.51.100.2', BROWSER_A)).status).toBe(201);
    expect(await signUp('acct_03', '198.51.100.3', BROWSER_A)).toMatchObject({ status: 429, body: { error: 'prereg_limit' } });
    expect(lines.at(-1)).toBe('signup 198.51.100.3 acct_03 prereg_limit:browser');
    expect((await signUp('acct_04', '198.51.100.3', BROWSER_B)).status).toBe(201);
  });

  it('gives the place back when no account is made (name taken, database error)', async () => {
    deps.prereg = () => on(1);
    store.answer = 0;
    expect((await signUp('taken_01', '198.51.100.9')).status).toBe(409);
    store.answer = new Error('down');
    expect((await signUp('acct_01', '198.51.100.9')).status).toBe(500);
    store.answer = 1;
    expect((await signUp('acct_02', '198.51.100.9')).status).toBe(201);
  });

  it('caps nothing with the lock off or PREREG_MAX_ACCOUNTS_PER_IP=0', async () => {
    for (const rule of [PREREG_OFF, on(0)]) {
      deps.prereg = () => rule;
      for (let i = 0; i < 4; i++) expect((await signUp(`acct_${rule.on ? 'b' : 'a'}${i}`, '198.51.100.7')).status).toBe(201);
    }
  });

  it('keeps every account made in the file, and counts the pre-registration ones again after a restart', async () => {
    const file = tempFile();
    deps.signUps = SignUpBook.open(file, log);
    deps.prereg = () => PREREG_OFF;
    expect((await signUp('before_01', '198.51.100.4', BROWSER_A)).status).toBe(201);
    deps.prereg = () => on(2);
    expect((await signUp('acct_01', '198.51.100.4', BROWSER_A)).status).toBe(201);
    expect((await signUp('acct_02', '198.51.100.4', BROWSER_A)).status).toBe(201);

    const records = readSignUps(readFileSync(file, 'utf8'));
    expect(records.map(({ account, ip, browser, prereg }) => ({ account, ip, browser, prereg }))).toEqual([
      { account: 'before_01', ip: '198.51.100.4', browser: BROWSER_A, prereg: false },
      { account: 'acct_01', ip: '198.51.100.4', browser: BROWSER_A, prereg: true },
      { account: 'acct_02', ip: '198.51.100.4', browser: BROWSER_A, prereg: true },
    ]);
    expect(records[0]!.time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

    // a restart: the account made before pre-registration does not count, the two others do
    deps.signUps = SignUpBook.open(file, log);
    expect(lines.at(-1)).toBe(`signups: 3 kept in ${file}, 2 of them during pre-registration`);
    expect((await signUp('acct_03', '198.51.100.4')).status).toBe(429);
    expect((await signUp('acct_04', '198.51.100.8', BROWSER_A)).status).toBe(429);
  });

  it('skips a line cut short in the file', () => {
    const text = '{"time":"t","account":"a","ip":"1.2.3.4","browser":"","prereg":true}\n{"time":"t","acc\n\n';
    expect(readSignUps(text)).toEqual([{ time: 't', account: 'a', ip: '1.2.3.4', browser: '', prereg: true }]);
  });
});

describe('PreregSettings', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it('reads the file at every call, logs each change once, and is off with no file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prereg-'));
    dirs.push(dir);
    const path = join(dir, '.env');
    const logged: string[] = [];
    const settings = new PreregSettings(path, { info: (l) => logged.push(l), warn: (l) => logged.push(l) });
    expect(settings.rule().on).toBe(false);
    writeFileSync(path, 'PREREG_ONLY=true\n');
    expect(settings.rule()).toMatchObject({ on: true, maxAccounts: 3 });
    expect(settings.rule()).toMatchObject({ on: true, maxAccounts: 3 });
    writeFileSync(path, 'PREREG_ONLY=true\nPREREG_MAX_ACCOUNTS_PER_IP=0\n');
    expect(settings.rule()).toMatchObject({ on: true, maxAccounts: 0 });
    expect(logged).toEqual([
      `prereg: off, no sign-up cap (no file at ${path})`,
      `prereg: on, at most 3 account(s) per IP and per browser (${path})`,
      `prereg: on, no sign-up cap: PREREG_MAX_ACCOUNTS_PER_IP is 0 (${path})`,
    ]);
  });

  it('is off with no --env file', () => {
    expect(new PreregSettings(undefined, { info: () => {}, warn: () => {} }).rule().on).toBe(false);
  });
});

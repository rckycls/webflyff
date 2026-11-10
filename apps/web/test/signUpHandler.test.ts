import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '@flyffweb/protocol';
import { beforeEach, expect, it } from 'vitest';
import type { AccountStore } from '../src/accountStore';
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
    address: '203.0.113.7', origin: config.siteOrigin, contentType: 'application/json',
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

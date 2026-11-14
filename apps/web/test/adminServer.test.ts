import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createAdminServer } from '../src/admin/adminServer';
import type { ActionHandler } from '../src/admin/adminServer';
import { TEST_PASSWORD, testDeps } from './support/adminDeps';
import type { TestDeps } from './support/adminDeps';

const ORIGIN = 'https://admin.play.example.com';
const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

interface Reply { status: number; headers: IncomingHttpHeaders; body: any }

async function start(deps: TestDeps): Promise<number> {
  const server = createAdminServer(deps);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}

function call(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown = text;
        try { parsed = text === '' ? undefined : JSON.parse(text); } catch { /* a page */ }
        resolve({ status: res.statusCode!, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const json = { 'Content-Type': 'application/json', Origin: ORIGIN };

async function login(port: number, deps: TestDeps, code = deps.code(), password = TEST_PASSWORD): Promise<Reply> {
  return call(port, 'POST', '/api/login', json, JSON.stringify({ user: 'Poreotix', password, code }));
}

function cookieOf(reply: Reply): string {
  const set = reply.headers['set-cookie']?.[0] ?? '';
  return set.split(';')[0]!;
}

it('logs in with name, password and code, and sets a strict cookie', async () => {
  const deps = testDeps();
  const port = await start(deps);
  const reply = await login(port, deps);
  expect(reply.status).toBe(200);
  expect(reply.body.user).toBe('Poreotix');
  expect(reply.body.csrf).toMatch(/^[\w-]{43}$/);
  const set = reply.headers['set-cookie']![0]!;
  expect(set).toMatch(/^__Host-admin=[\w-]{43};/);
  for (const part of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(set).toContain(part);
  expect(deps.store.log.at(-1)).toMatchObject({ action: 'login', result: 'ok', admin: 'Poreotix' });
  const session = await call(port, 'GET', '/api/session', { Cookie: cookieOf(reply) });
  expect(session).toMatchObject({ status: 200, body: { user: 'Poreotix', csrf: reply.body.csrf } });
});

it('refuses a wrong code with one answer and logs it without the secrets', async () => {
  const deps = testDeps();
  const port = await start(deps);
  const reply = await login(port, deps, '000000');
  expect(reply).toMatchObject({ status: 400, body: { error: 'wrong' } });
  expect(reply.headers['set-cookie']).toBeUndefined();
  const row = deps.store.log.at(-1)!;
  expect(row).toMatchObject({ action: 'login_failed', result: 'refused' });
  expect(row.before + row.after).not.toContain(TEST_PASSWORD);
  expect(row.before + row.after).not.toContain('000000');
  expect((await login(port, deps, deps.code(), 'wrong password!')).body.error).toBe('wrong');
});

it('takes a code only once', async () => {
  const deps = testDeps();
  const port = await start(deps);
  const code = deps.code();
  expect((await login(port, deps, code)).status).toBe(200);
  expect(await login(port, deps, code)).toMatchObject({ status: 400, body: { error: 'wrong' } });
});

it('makes an address wait after 5 wrong logins', async () => {
  const deps = testDeps();
  const port = await start(deps);
  for (let i = 0; i < 5; i++) expect((await login(port, deps, '000000')).status).toBe(400);
  expect(await login(port, deps)).toMatchObject({ status: 429, body: { error: 'too_many' } });
});

it('checks the type, size, origin, session and token of every post', async () => {
  const deps = testDeps();
  const port = await start(deps);
  const loggedIn = await login(port, deps);
  const cookie = cookieOf(loggedIn);
  const token = loggedIn.body.csrf as string;
  const good = { ...json, Cookie: cookie, 'X-Admin-Token': token };
  expect((await call(port, 'POST', '/api/logout', { ...good, Origin: 'https://evil.example.com' }, '{}')).status).toBe(403);
  expect((await call(port, 'POST', '/api/logout', { ...good, 'X-Admin-Token': 'nope' }, '{}')).status).toBe(403);
  expect((await call(port, 'POST', '/api/logout', { ...good, 'Content-Type': 'text/plain' }, '{}')).status).toBe(415);
  expect((await call(port, 'POST', '/api/logout', good, JSON.stringify({ pad: 'x'.repeat(17 * 1024) }))).status).toBe(413);
  expect((await call(port, 'POST', '/api/logout', { ...good, Cookie: '__Host-admin=gone' }, '{}'))).toMatchObject({ status: 401, body: { error: 'session' } });
  expect((await call(port, 'POST', '/api/logout', good, '{}')).status).toBe(200);
  expect((await call(port, 'GET', '/api/session', { Cookie: cookie })).status).toBe(401);
});

it('takes a write\'s request id once', async () => {
  let runs = 0;
  const write: ActionHandler = async () => { runs++; return { status: 200, body: { ok: true } }; };
  const deps = testDeps({ actions: { 'test.write': write } });
  const port = await start(deps);
  const loggedIn = await login(port, deps);
  const headers = { ...json, Cookie: cookieOf(loggedIn), 'X-Admin-Token': loggedIn.body.csrf as string };
  expect((await call(port, 'POST', '/api/test.write', headers, '{}'))).toMatchObject({ status: 400, body: { error: 'invalid', field: 'requestId' } });
  expect((await call(port, 'POST', '/api/test.write', headers, JSON.stringify({ requestId: 'r-1' }))).status).toBe(200);
  expect(await call(port, 'POST', '/api/test.write', headers, JSON.stringify({ requestId: 'r-1' }))).toMatchObject({ status: 409, body: { error: 'repeat' } });
  expect(runs).toBe(1);
  expect((await call(port, 'POST', '/api/nothing.here', headers, '{}')).status).toBe(404);
});

it('serves only its own files, with the security headers on every answer', async () => {
  const deps = testDeps();
  const port = await start(deps);
  const page = await call(port, 'GET', '/');
  expect(page.status).toBe(200);
  expect(page.headers['content-type']).toMatch(/^text\/html/);
  for (const path of ['/etc/passwd', '/js/../server.ts', '/../src/main.ts', '/index.html/x']) {
    expect((await call(port, 'GET', path)).status).toBe(404);
  }
  for (const reply of [page, await call(port, 'GET', '/nope'), await login(port, deps, '000000')]) {
    expect(reply.headers['content-security-policy']).toContain("default-src 'none'");
    expect(reply.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(reply.headers['x-frame-options']).toBe('DENY');
    expect(reply.headers['referrer-policy']).toBe('no-referrer');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(reply.headers['cache-control']).toBe('no-store');
  }
});

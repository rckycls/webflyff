import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import type { AccountStore } from '../src/accountStore';
import { parseWebConfig } from '../src/config';
import type { WebConfig } from '../src/config';
import { HourlyLimit } from '../src/hourlyLimit';
import { RefusalLog } from '../src/refusalLog';
import { createWebServer } from '../src/server';
import { StatusCache } from '../src/status';
import { TicketBook } from '../src/ticket';

const baseConfig = parseWebConfig({
  ...JSON.parse(readFileSync(fileURLToPath(new URL('../web.config.example.json', import.meta.url)), 'utf8')),
  siteOrigin: 'https://play.example.com',
  ticketSecret: 'k'.repeat(40),
});

const servers: Server[] = [];
afterEach(() => { for (const server of servers.splice(0)) server.close(); });

interface Started { port: number; lines: string[]; store: { calls: string[][] }; setNow(t: number): void }

async function start(config: WebConfig = baseConfig): Promise<Started> {
  let now = 1_000_000;
  const clock = () => now;
  const lines: string[] = [];
  const calls: string[][] = [];
  const store: AccountStore = {
    create: async (...args) => { calls.push(args); return 1; },
    onlineCount: async () => 4,
  };
  const server = createWebServer({
    config, store,
    tickets: new TicketBook(config.ticketSecret, clock),
    attempts: new HourlyLimit(config.limits.attemptsPerHour, clock),
    createdByAddress: new HourlyLimit(config.limits.createdPerHourPerAddress, clock),
    createdInAll: new HourlyLimit(config.limits.createdPerHour, clock),
    ticketsByAddress: new HourlyLimit(config.limits.ticketsPerHourPerAddress, clock),
    status: new StatusCache(async () => ({ online: true, players: 4, checkedAt: '2026-11-11T00:00:00.000Z' }), clock),
    log: { info: (line) => lines.push(line), warn: (line) => lines.push(line) },
    refusals: new RefusalLog({ info: (line) => lines.push(line), warn: (line) => lines.push(line) }),
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: (server.address() as AddressInfo).port, lines, store: { calls }, setNow: (t) => { now = t; } };
}

interface Reply { status: number; headers: IncomingHttpHeaders; body: unknown }

function call(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode!, headers: res.headers, body: text === '' ? undefined : JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const signUpHeaders = { 'Content-Type': 'application/json', Origin: 'https://play.example.com' };

it('serves a ticket, a sign-up and the status', async () => {
  const site = await start();
  const ticket = await call(site.port, 'GET', '/api/sign-up/ticket');
  expect(ticket.status).toBe(200);
  const { ticket: text } = ticket.body as { ticket: string };
  expect(text).toMatch(/^\d+\.[\w-]+\.[\w-]+$/);
  site.setNow(1_005_000);
  const signUp = await call(site.port, 'POST', '/api/sign-up', signUpHeaders,
    JSON.stringify({ account: 'Hero_01', password: 'abc12345', email: '', website: '', ticket: text }));
  expect(signUp).toMatchObject({ status: 201, body: { ok: true } });
  expect(site.store.calls[0]![0]).toBe('hero_01');
  const status = await call(site.port, 'GET', '/api/status');
  expect(status).toMatchObject({ status: 200, body: { online: true, players: 4 } });
  for (const reply of [ticket, signUp, status]) {
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['content-type']).toMatch(/^application\/json/);
  }
});

it('takes the address from X-Forwarded-For only from a trusted proxy', async () => {
  const trusted = await start({ ...baseConfig, trustedProxies: ['127.0.0.1'] });
  await call(trusted.port, 'POST', '/api/sign-up', { ...signUpHeaders, 'X-Forwarded-For': '10.0.0.1, 198.51.100.9' }, '{}');
  expect(trusted.lines.at(-1)).toMatch(/^signup 198\.51\.100\.9 /);
  const direct = await start({ ...baseConfig, trustedProxies: [] });
  await call(direct.port, 'POST', '/api/sign-up', { ...signUpHeaders, 'X-Forwarded-For': '198.51.100.9' }, '{}');
  expect(direct.lines.at(-1)).toMatch(/^signup 127\.0\.0\.1 /);
});

it('answers 413 for a big body without reading it all', async () => {
  const site = await start();
  const reply = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1', port: site.port, method: 'POST', path: '/api/sign-up',
      headers: { ...signUpHeaders, 'Content-Length': '1000000' },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    // 2 KB of the million: the answer comes without the rest
    req.write(Buffer.alloc(2048, 0x20));
  });
  expect(reply).toEqual({ status: 413, body: { error: 'size' } });
  expect(site.lines).toEqual(['signup 127.0.0.1 - size']);
});

it('answers 404 JSON elsewhere and sends no CORS headers', async () => {
  const site = await start();
  for (const [method, path] of [['GET', '/api/nope'], ['GET', '/api/sign-up'], ['POST', '/api/status'], ['OPTIONS', '/api/sign-up'], ['GET', '/']]) {
    const reply = await call(site.port, method!, path!, { Origin: 'https://evil.example' });
    expect(reply).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect(Object.keys(reply.headers).filter((name) => name.startsWith('access-control-'))).toEqual([]);
    expect(reply.headers['cache-control']).toBe('no-store');
  }
});

it('limits tickets per address', async () => {
  const site = await start();
  for (let i = 0; i < 60; i++) expect((await call(site.port, 'GET', '/api/sign-up/ticket')).status).toBe(200);
  expect(await call(site.port, 'GET', '/api/sign-up/ticket')).toMatchObject({ status: 429, body: { error: 'too_many' } });
});

it('reads the path without its query', async () => {
  const site = await start();
  expect((await call(site.port, 'GET', '/api/status?x=1')).status).toBe(200);
});

import { writeFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { startAdmin } from '../src/admin/startAdmin';
import type { Server } from 'node:http';
import { MemoryAdminStore } from './support/memoryAdminStore';
import { TEST_SECRET, testConfig } from './support/adminDeps';
import { hashAdminPassword } from '../src/admin/password';

const started: Server[] = [];
afterEach(() => { for (const s of started.splice(0)) s.close(); });

function lines() {
  const out: string[] = [];
  return { out, log: { info: (l: string) => out.push(l), warn: (l: string) => out.push(l) } };
}

const dir = mkdtempSync(join(tmpdir(), 'admin-'));
const goodFile = join(dir, 'admin-login.json');
writeFileSync(goodFile, JSON.stringify({ user: 'Poreotix', passwordHash: hashAdminPassword('a long password!'), totpSecret: TEST_SECRET }));

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  probe.close();
  return port;
}

it('stays off with a bad admin section, and says why', async () => {
  const { out, log } = lines();
  const server = await startAdmin({ ...testConfig, admin: undefined, adminProblem: 'admin.listen.host must be 127.0.0.1' }, log, () => new MemoryAdminStore(), []);
  expect(server).toBeUndefined();
  expect(out).toContain('admin: panel off: admin.listen.host must be 127.0.0.1');
});

it('stays off without a section, quietly', async () => {
  const { out, log } = lines();
  expect(await startAdmin({ ...testConfig, admin: undefined, adminProblem: undefined }, log, () => new MemoryAdminStore(), [])).toBeUndefined();
  expect(out).toEqual([]);
});

it('stays off when the login file is missing or bad', async () => {
  const { out, log } = lines();
  const missing = { ...testConfig, admin: { ...testConfig.admin, credentialsFile: join(dir, 'none.json') } };
  expect(await startAdmin(missing, log, () => new MemoryAdminStore(), [])).toBeUndefined();
  expect(out[0]).toMatch(/^admin: panel off: .*none\.json/);
  const badFile = join(dir, 'bad.json');
  writeFileSync(badFile, '{"user":"Poreotix"}');
  expect(await startAdmin({ ...testConfig, admin: { ...testConfig.admin, credentialsFile: badFile } }, log, () => new MemoryAdminStore(), [])).toBeUndefined();
  expect(out[1]).toMatch(/^admin: panel off: .*passwordHash/);
});

it('stays off when its port is taken, without throwing', async () => {
  const { out, log } = lines();
  const port = await freePort();
  const blocker = createServer();
  blocker.listen(port, '127.0.0.1');
  await once(blocker, 'listening');
  try {
    const config = { ...testConfig, admin: { ...testConfig.admin, credentialsFile: goodFile, listen: { host: '127.0.0.1', port } } };
    expect(await startAdmin(config, log, () => new MemoryAdminStore(), [])).toBeUndefined();
    expect(out.at(-1)).toMatch(/^admin: panel off: cannot listen on 127\.0\.0\.1:\d+/);
  } finally {
    blocker.close();
  }
});

it('listens when everything is good', async () => {
  const { out, log } = lines();
  const port = await freePort();
  const config = { ...testConfig, admin: { ...testConfig.admin, credentialsFile: goodFile, listen: { host: '127.0.0.1', port } } };
  const server = await startAdmin(config, log, () => new MemoryAdminStore(), []);
  expect(server).toBeDefined();
  started.push(server!);
  expect(out.at(-1)).toBe(`admin: listening 127.0.0.1:${port}`);
});

import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { STATUS_ACTIONS } from '../src/admin/actions/status';
import { characterEditsOpen, probeState, readServers } from '../src/admin/serverState';
import { MemoryAdminStore, memoryCharacter } from './support/memoryAdminStore';
import { allPorts, testContext, testDeps } from './support/adminDeps';

function without(...closed: number[]): Set<number> {
  const open = allPorts();
  for (const port of closed) open.delete(port);
  return open;
}

const DATABASE_AND_WORLD = [7000, 24000, 7200, 3101];

it('shows every server up, and locks character edits, while all runs', async () => {
  const store = new MemoryAdminStore({ characters: [memoryCharacter('0000001', 'Hero', 'tester1', { online: true })] });
  const deps = testDeps({ store });
  const status = await STATUS_ACTIONS.status({}, testContext(deps), deps);
  expect(status.status).toBe(200);
  expect((status.body.servers as { up: string }[]).every((s) => s.up === 'up')).toBe(true);
  expect(status.body).toMatchObject({ gateway: true, sql: true, players: 1, stale: false, charactersOpen: false });
  expect((status.body.online as { name: string }[]).map((c) => c.name)).toEqual(['Hero']);
});

it('calls a server with some ports closed partial, and keeps edits locked', async () => {
  const deps = testDeps({ openPorts: without(7000) });
  const servers = await readServers(deps);
  expect(servers.find((s) => s.name === 'Database')!.up).toBe('partial');
  expect(servers.find((s) => s.name === 'Login')!.up).toBe('up');
  expect((await characterEditsOpen(deps)).open).toBe(false);
});

it('keeps edits locked while only the World runs', async () => {
  const deps = testDeps({ openPorts: without(7000, 24000, 7200) });
  const lock = await characterEditsOpen(deps);
  expect(lock.open).toBe(false);
  expect(lock.seen).toBe('Database down, World up');
});

it('opens character edits with the Database and World stopped, and calls the online list stale', async () => {
  const store = new MemoryAdminStore({ characters: [memoryCharacter('0000001', 'Hero', 'tester1', { online: true })] });
  const deps = testDeps({ store, openPorts: without(...DATABASE_AND_WORLD) });
  expect(await characterEditsOpen(deps)).toEqual({ open: true, seen: 'Database down, World down' });
  const status = await STATUS_ACTIONS.status({}, testContext(deps), deps);
  expect(status.body).toMatchObject({ charactersOpen: true, stale: true, online: null });
});

it('keeps edits locked when a Database or World port gives no clear answer', async () => {
  const deps = testDeps({ openPorts: without(...DATABASE_AND_WORLD), unknownPorts: new Set([24000]) });
  const lock = await characterEditsOpen(deps);
  expect(lock).toEqual({ open: false, seen: 'Database unknown, World down' });
  const servers = await readServers(deps);
  expect(servers.find((s) => s.name === 'Database')!.up).toBe('unknown');
  const status = await STATUS_ACTIONS.status({}, testContext(deps), deps);
  expect(status.body).toMatchObject({ charactersOpen: false, lockSeen: 'Database unknown, World down' });
});

it('tells a refused port from one that does not answer', async () => {
  const listening = createServer();
  listening.listen(0, '127.0.0.1');
  await once(listening, 'listening');
  const openPort = (listening.address() as AddressInfo).port;
  const closing = createServer();
  closing.listen(0, '127.0.0.1');
  await once(closing, 'listening');
  const closedPort = (closing.address() as AddressInfo).port;
  closing.close();
  await once(closing, 'close');
  try {
    expect(await probeState('127.0.0.1', openPort, 3000)).toBe('open');
    expect(await probeState('127.0.0.1', closedPort, 3000)).toBe('closed');
    // a non-routable address: no answer at all within the time given
    expect(await probeState('10.255.255.1', 9, 200)).toBe('unknown');
  } finally {
    listening.close();
  }
});

it('answers without SQL Server, with no players count', async () => {
  const store = new MemoryAdminStore();
  store.sqlDown = true;
  const deps = testDeps({ store });
  const status = await STATUS_ACTIONS.status({}, testContext(deps), deps);
  expect(status.status).toBe(200);
  expect(status.body).toMatchObject({ sql: false, players: null, online: null });
});
